import express from "express";
import {
  createUserPayment,
  getAllUserPayments,
  getUserPaymentById,
  getUserPaymentByAadhar,
  recordPayment,
  recordBulkPayment,
  getPaymentHistory,
  updateUserPayment,
  deleteUserPayment,
} from "../controllers/userPaymentsController.js";

const router = express.Router();

router.post("/", createUserPayment);
router.get("/", getAllUserPayments);
router.get("/:id", getUserPaymentById);
router.get("/aadhar/:aadharNumber", getUserPaymentByAadhar);
router.post("/:id/pay", recordPayment);
router.post("/:id/bulk-pay", recordBulkPayment);
router.get("/:id/payment-history", getPaymentHistory);
router.put("/:id", updateUserPayment);
router.delete("/:id", deleteUserPayment);

export default router;
