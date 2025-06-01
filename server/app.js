const express = require("express");
const cors = require('cors');
const app = express();


const userRoutes = require("./routes/userRoutes");
const classRoutes = require("./routes/classRoutes");
const testRoutes = require("./routes/testRoutes");
const responseRoutes = require("./routes/responseRoutes");
const questionRoutes = require("./routes/questionRoutes");
const authMiddleware = require("./middlewares/authMiddleware");

app.use(cors());
app.use(express.json());

app.use("/api/users", userRoutes);
app.use("/api/questions", authMiddleware, questionRoutes);
app.use("/api/responses", authMiddleware, responseRoutes);
app.use("/api/tests", authMiddleware, testRoutes);
app.use("/api/class", authMiddleware, classRoutes);

const PORT = process.env.API_PORT || 3000;

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
