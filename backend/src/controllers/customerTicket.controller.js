
import mongoose from "mongoose";
import {Ticket} from "../models/Ticket.js";
import { Category } from "../models/Category.js";
import { nextTicketNumber } from "../models/Counter.js";

// POST /api/tickets
export const createCustomerTicket = async (req, res, next) => {
  try {
    const { subject, description, category, priority } = req.body;

    if (
      typeof subject !== "string" ||
      !subject.trim() ||
      typeof description !== "string" ||
      !description.trim() ||
      !category
    ) {
      return res.status(400).json({
        success: false,
        message: "Subject, description and category are required.",
      });
    }

    if (!mongoose.isValidObjectId(category)) {
      return res.status(400).json({
        success: false,
        message: "Invalid category ID.",
      });
    }

    const categoryExists = await Category.findOne({
  _id: category,
  isActive: true,
});

    if (!categoryExists) {
      return res.status(400).json({
        success: false,
        message: "Category not found.",
      });
    }

    const allowedPriorities = ["low", "medium", "high", "urgent"];
    const selectedPriority = priority || "medium";

    if (!allowedPriorities.includes(selectedPriority)) {
      return res.status(400).json({
        success: false,
        message: "Invalid priority.",
      });
    }

    const ticket = await Ticket.create({
      ticketNumber: await nextTicketNumber(),
      subject: subject.trim(),
      description: description.trim(),
      category,
      priority: selectedPriority,
      createdBy: req.user._id,
    });

    return res.status(201).json({
      success: true,
      message: "Ticket created successfully.",
      data: ticket,
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/tickets/my
export const getMyTickets = async (req, res, next) => {
  try {
    const tickets = await Ticket.find({
      createdBy: req.user._id,
    })
      .populate("category")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: tickets.length,
      data: tickets,
    });
  } catch (error) {
    next(error);
  }
};

export { Category };