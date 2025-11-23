import UserPayment from "../models/userPayment.js";

// @desc    Create new user payment account
// @route   POST /api/user-payments
// @access  Public
const createUserPayment = async (req, res) => {
  try {
    const data = { ...req.body };

    // Calculate derived fields before creating the document
    if (data.startDate && data.tenure && !data.endDate) {
      const endDate = new Date(data.startDate);
      endDate.setMonth(endDate.getMonth() + data.tenure);
      data.endDate = endDate;
    }

    if (data.chitAmount && data.tenure && !data.monthlyPremium) {
      data.monthlyPremium = data.chitAmount / data.tenure;
    }

    // Set default values for summary fields
    data.totalPaidAmount = 0;
    data.completedMonths = 0;
    data.pendingMonths = data.tenure;
    data.lastPaymentDate = null;

    const userPayment = new UserPayment(data);
    const savedUserPayment = await userPayment.save();

    res.status(201).json({
      success: true,
      message: "User payment account created successfully",
      data: savedUserPayment,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "Aadhar number already exists",
      });
    }

    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get all user payments
// @route   GET /api/user-payments
// @access  Public
const getAllUserPayments = async (req, res) => {
  try {
    const { status, page = 1, limit = 10, aadharNumber, search } = req.query;

    let query = {};
    if (status) query.status = status;
    if (aadharNumber) query.aadharNumber = aadharNumber;

    // Search functionality
    if (search) {
      query.$or = [
        { memberName: { $regex: search, $options: "i" } },
        { aadharNumber: { $regex: search, $options: "i" } },
        { phoneNumber: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }

    const userPayments = await UserPayment.find(query)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await UserPayment.countDocuments(query);

    res.json({
      success: true,
      count: userPayments.length,
      total,
      pages: Math.ceil(total / limit),
      currentPage: parseInt(page),
      data: userPayments,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get single user payment by ID
// @route   GET /api/user-payments/:id
// @access  Public
const getUserPaymentById = async (req, res) => {
  try {
    const userPayment = await UserPayment.findById(req.params.id);

    if (!userPayment) {
      return res.status(404).json({
        success: false,
        message: "User payment account not found",
      });
    }

    const paymentSummary = userPayment.getPaymentSummary();

    res.json({
      success: true,
      data: userPayment,
      summary: paymentSummary,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get user payment by Aadhar number
// @route   GET /api/user-payments/aadhar/:aadharNumber
// @access  Public
const getUserPaymentByAadhar = async (req, res) => {
  try {
    const userPayment = await UserPayment.findOne({
      aadharNumber: req.params.aadharNumber,
    });

    if (!userPayment) {
      return res.status(404).json({
        success: false,
        message: "User payment account not found for this Aadhar number",
      });
    }

    const paymentSummary = userPayment.getPaymentSummary();

    res.json({
      success: true,
      data: userPayment,
      summary: paymentSummary,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Record a payment for specific months
// @route   POST /api/user-payments/:id/pay
// @access  Public
const recordPayment = async (req, res) => {
  try {
    const {
      monthNumbers,
      amount,
      paymentDate,
      paymentMethod,
      transactionId,
      remarks,
    } = req.body;

    const userPayment = await UserPayment.findById(req.params.id);
    if (!userPayment) {
      return res.status(404).json({
        success: false,
        message: "User payment account not found",
      });
    }

    // Validate month numbers
    const invalidMonths = monthNumbers.filter(
      (month) => month < 1 || month > userPayment.tenure
    );

    if (invalidMonths.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Invalid month numbers: ${invalidMonths.join(
          ", "
        )}. Must be between 1 and ${userPayment.tenure}`,
      });
    }

    // Check for duplicate month payments
    const existingMonths = userPayment.paymentRecords
      .filter(
        (record) =>
          monthNumbers.includes(record.monthNumber) && record.status === "paid"
      )
      .map((record) => record.monthNumber);

    if (existingMonths.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Months already paid: ${existingMonths.join(", ")}`,
      });
    }

    // Calculate due dates for each month
    const paymentRecords = monthNumbers.map((monthNumber) => {
      const dueDate = new Date(userPayment.startDate);
      dueDate.setMonth(dueDate.getMonth() + monthNumber - 1);

      return {
        monthNumber,
        amount: amount / monthNumbers.length,
        paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
        dueDate,
        status: "paid",
        paymentMethod: paymentMethod || "cash",
        transactionId,
        remarks,
      };
    });

    // Add new payment records
    userPayment.paymentRecords.push(...paymentRecords);

    const updatedUserPayment = await userPayment.save();
    const paymentSummary = updatedUserPayment.getPaymentSummary();

    res.json({
      success: true,
      message: `Payment recorded successfully for ${monthNumbers.length} month(s)`,
      data: updatedUserPayment,
      summary: paymentSummary,
      paidMonths: monthNumbers,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Record bulk payment for multiple months
// @route   POST /api/user-payments/:id/bulk-pay
// @access  Public
const recordBulkPayment = async (req, res) => {
  try {
    const { payments } = req.body;

    const userPayment = await UserPayment.findById(req.params.id);
    if (!userPayment) {
      return res.status(404).json({
        success: false,
        message: "User payment account not found",
      });
    }

    // Validate each payment
    for (let payment of payments) {
      if (payment.monthNumber < 1 || payment.monthNumber > userPayment.tenure) {
        return res.status(400).json({
          success: false,
          message: `Invalid month number: ${payment.monthNumber}. Must be between 1 and ${userPayment.tenure}`,
        });
      }

      const existingPayment = userPayment.paymentRecords.find(
        (record) =>
          record.monthNumber === payment.monthNumber && record.status === "paid"
      );

      if (existingPayment) {
        return res.status(400).json({
          success: false,
          message: `Month ${payment.monthNumber} is already paid`,
        });
      }
    }

    // Create payment records with due dates
    const paymentRecords = payments.map((payment) => {
      const dueDate = new Date(userPayment.startDate);
      dueDate.setMonth(dueDate.getMonth() + payment.monthNumber - 1);

      return {
        monthNumber: payment.monthNumber,
        amount: payment.amount,
        paymentDate: payment.paymentDate
          ? new Date(payment.paymentDate)
          : new Date(),
        dueDate,
        status: "paid",
        paymentMethod: payment.paymentMethod || "cash",
        transactionId: payment.transactionId,
        remarks: payment.remarks,
        lateFee: payment.lateFee || 0,
      };
    });

    userPayment.paymentRecords.push(...paymentRecords);
    const updatedUserPayment = await userPayment.save();
    const paymentSummary = updatedUserPayment.getPaymentSummary();

    res.json({
      success: true,
      message: `Bulk payment recorded successfully for ${payments.length} month(s)`,
      data: updatedUserPayment,
      summary: paymentSummary,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get payment history for a user
// @route   GET /api/user-payments/:id/payment-history
// @access  Public
const getPaymentHistory = async (req, res) => {
  try {
    const userPayment = await UserPayment.findById(req.params.id);

    if (!userPayment) {
      return res.status(404).json({
        success: false,
        message: "User payment account not found",
      });
    }

    const paidPayments = userPayment.paymentRecords
      .filter(
        (record) => record.status === "paid" || record.status === "partial"
      )
      .sort((a, b) => b.paymentDate - a.paymentDate);

    const pendingPayments = userPayment.paymentRecords
      .filter(
        (record) => record.status === "pending" || record.status === "overdue"
      )
      .sort((a, b) => a.monthNumber - b.monthNumber);

    res.json({
      success: true,
      data: {
        paidPayments,
        pendingPayments,
        totalPaid: paidPayments.length,
        totalPending: pendingPayments.length,
        summary: userPayment.getPaymentSummary(),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Update user payment account
// @route   PUT /api/user-payments/:id
// @access  Public
const updateUserPayment = async (req, res) => {
  try {
    const userPayment = await UserPayment.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!userPayment) {
      return res.status(404).json({
        success: false,
        message: "User payment account not found",
      });
    }

    res.json({
      success: true,
      message: "User payment account updated successfully",
      data: userPayment,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Delete user payment account
// @route   DELETE /api/user-payments/:id
// @access  Public
const deleteUserPayment = async (req, res) => {
  try {
    const userPayment = await UserPayment.findByIdAndDelete(req.params.id);

    if (!userPayment) {
      return res.status(404).json({
        success: false,
        message: "User payment account not found",
      });
    }

    res.json({
      success: true,
      message: "User payment account deleted successfully",
      data: userPayment,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export {
  createUserPayment,
  getAllUserPayments,
  getUserPaymentById,
  getUserPaymentByAadhar,
  recordPayment,
  recordBulkPayment,
  getPaymentHistory,
  updateUserPayment,
  deleteUserPayment,
};
