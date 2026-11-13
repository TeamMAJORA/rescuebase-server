const express = require("express");

const app = express();

console.log("[Vercel] Diagnostic function loaded");

app.get("/", (req, res) => {
    res.json({
        status: "online",
        message: "RescueBase Vercel function is running"
    });
});

app.get("/api/payment-methods/public", (req, res) => {
    res.json({
        status: "online",
        message: "Payment methods diagnostic endpoint working"
    });
});

module.exports = app;