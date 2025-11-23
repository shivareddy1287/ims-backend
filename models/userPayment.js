import mongoose from "mongoose";

const paymentRecordSchema = new mongoose.Schema({
  monthNumber: {
    type: Number,
    required: [true, "Month number is required"],
    min: [1, "Month number must be at least 1"],
  },
  amount: {
    type: Number,
    required: [true, "Payment amount is required"],
    min: [0, "Amount cannot be negative"],
  },
  paymentDate: {
    type: Date,
    required: [true, "Payment date is required"],
    default: Date.now,
  },
  dueDate: {
    type: Date,
    required: [true, "Due date is required"],
  },
  status: {
    type: String,
    enum: ["paid", "pending", "overdue", "partial"],
    default: "pending",
  },
  paymentMethod: {
    type: String,
    enum: ["cash", "bank_transfer", "upi", "cheque", "card"],
    default: "cash",
  },
  transactionId: {
    type: String,
    trim: true,
  },
  remarks: {
    type: String,
    trim: true,
    maxlength: [500, "Remarks cannot exceed 500 characters"],
  },
  lateFee: {
    type: Number,
    default: 0,
    min: [0, "Late fee cannot be negative"],
  },
});

const userPaymentSchema = new mongoose.Schema(
  {
    memberName: {
      type: String,
      required: [true, "Member name is required"],
      trim: true,
    },
    aadharNumber: {
      type: String,
      required: [true, "Aadhar number is required"],
      match: [/^\d{12}$/, "Please enter a valid 12-digit Aadhar number"],
      unique: true,
      index: true, // Remove this line to fix duplicate index warning
    },
    phoneNumber: {
      type: String,
      required: [true, "Phone number is required"],
      match: [/^\d{10}$/, "Please enter a valid 10-digit phone number"],
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      lowercase: true,
      match: [
        /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
        "Please enter a valid email",
      ],
    },
    address: {
      street: String,
      city: String,
      state: String,
      pincode: String,
    },
    chitAmount: {
      type: Number,
      required: [true, "Chit amount is required"],
      min: [1000, "Chit amount must be at least 1000"],
    },
    tenure: {
      type: Number,
      required: [true, "Tenure is required"],
      min: [1, "Tenure must be at least 1 month"],
    },
    monthlyPremium: {
      type: Number,
    },
    startDate: {
      type: Date,
      required: [true, "Start date is required"],
    },
    endDate: {
      type: Date,
    },
    status: {
      type: String,
      enum: ["active", "completed", "cancelled"],
      default: "active",
    },
    paymentRecords: [paymentRecordSchema],

    // Summary fields for easy querying
    totalPaidAmount: {
      type: Number,
      default: 0,
    },
    pendingMonths: {
      type: Number,
      default: 0,
    },
    completedMonths: {
      type: Number,
      default: 0,
    },
    lastPaymentDate: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Pre-save middleware to calculate derived fields
userPaymentSchema.pre("save", function (next) {
  // Calculate end date if not provided
  if (this.startDate && this.tenure && !this.endDate) {
    const endDate = new Date(this.startDate);
    endDate.setMonth(endDate.getMonth() + this.tenure);
    this.endDate = endDate;
  }

  // Calculate monthly premium if not provided
  if (this.chitAmount && this.tenure && !this.monthlyPremium) {
    this.monthlyPremium = this.chitAmount / this.tenure;
  }

  // Update summary fields based on payment records
  const paidRecords = this.paymentRecords.filter(
    (record) => record.status === "paid" || record.status === "partial"
  );

  this.completedMonths = paidRecords.length;
  this.pendingMonths = this.tenure - this.completedMonths;
  this.totalPaidAmount = paidRecords.reduce(
    (total, record) => total + record.amount,
    0
  );

  // Update last payment date
  if (paidRecords.length > 0) {
    const latestPayment = paidRecords.reduce((latest, record) =>
      record.paymentDate > latest.paymentDate ? record : latest
    );
    this.lastPaymentDate = latestPayment.paymentDate;
  }

  // Update status based on completion
  if (this.completedMonths >= this.tenure) {
    this.status = "completed";
  }

  next();
});

// Method to get payment summary
userPaymentSchema.methods.getPaymentSummary = function () {
  const paidRecords = this.paymentRecords.filter(
    (record) => record.status === "paid" || record.status === "partial"
  );

  return {
    totalMonths: this.tenure,
    completedMonths: this.completedMonths,
    pendingMonths: this.pendingMonths,
    totalPaidAmount: this.totalPaidAmount,
    totalDueAmount: this.tenure * this.monthlyPremium - this.totalPaidAmount,
    completionPercentage: ((this.completedMonths / this.tenure) * 100).toFixed(
      2
    ),
    nextDueMonth: this.completedMonths + 1,
    nextDueAmount: this.monthlyPremium,
  };
};

// Static method to find by Aadhar number
userPaymentSchema.statics.findByAadhar = function (aadharNumber) {
  return this.findOne({ aadharNumber });
};

// Index for better query performance - Remove duplicate definitions
// userPaymentSchema.index({ aadharNumber: 1 }); // Keep only this one
userPaymentSchema.index({ status: 1 });
userPaymentSchema.index({ createdAt: -1 });

export default mongoose.model("UserPayment", userPaymentSchema);
