const express = require("express");
const cors = require('cors');
const cookieParser = require('cookie-parser');
const app = express();


const userRoutes = require("./routes/userRoutes");
const classRoutes = require("./routes/classRoutes");
const testRoutes = require("./routes/testRoutes");
const responseRoutes = require("./routes/responseRoutes");
const questionRoutes = require("./routes/questionRoutes");
const textbookRoutes = require("./routes/textbookRoutes");
const authMiddleware = require("./middlewares/authMiddleware");

// credentials: true + an explicit origin (not '*') are both required for the browser to
// actually send/accept the httpOnly refresh-token cookie cross-origin (localhost:4200 ->
// localhost:3000 in dev). This doesn't force every request to be credentialed - it just
// permits it when the client opts in via withCredentials.
app.use(cors({
  origin: process.env.CLIENT_ORIGIN || 'http://localhost:4200',
  credentials: true,
}));
app.use(cookieParser());
app.use(express.json());

app.use("/api/users", userRoutes);
app.use("/api/questions", authMiddleware, questionRoutes);
app.use("/api/responses", authMiddleware, responseRoutes);
app.use("/api/tests", authMiddleware, testRoutes);
app.use("/api/class", authMiddleware, classRoutes);
app.use("/api/textbooks", authMiddleware, textbookRoutes);

const PORT = process.env.API_PORT || 3000;

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
