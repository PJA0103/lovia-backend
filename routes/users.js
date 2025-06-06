const express = require("express");
const router = express.Router();
const config = require("../config/index");
const { dataSource } = require("../db/data-source");
const logger = require("../utils/logger")("Users");
const users = require("../controllers/users");

const auth = require("../middlewares/auth")({
  secret: config.get("secret").jwtSecret,
  userRepository: dataSource.getRepository("Users"),
  logger
});

router.post("/signup", users.postSignup);
router.post("/signin", users.postLogin);
router.post("/status", auth, users.postStatus);
router.get("/profile", auth, users.getProfile);
router.patch("/profile", auth, users.patchProfile);

module.exports = router;
