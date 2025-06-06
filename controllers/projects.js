const express = require("express");
const { dataSource } = require("../db/data-source");
const logger = require("../utils/logger")("Projects");
const appError = require("../utils/appError");
const jwt = require("jsonwebtoken");

//  步驟一：建立專案
async function createProject(req, res, next) {
  try {
    const projectRepo = dataSource.getRepository("Projects");
    const userRepo = dataSource.getRepository("Users");
    const categoryRepo = dataSource.getRepository("Categories");

    const {
      title,
      summary,
      category_id,
      total_amount,
      start_time,
      end_time,
      cover,
      full_content,
      project_team,
      faq
    } = req.body;

    const missingFields = checkMissingProjectFields(req.body);
    if (missingFields.length > 0) {
      return res.status(400).json({
        status: false,
        message: `缺少必要欄位: ${missingFields.join(", ")}`
      });
    }

    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ status: false, message: "未提供有效的 token" });

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ status: false, message: "無效的 token" });
    }

    const user = await userRepo.findOneBy({ id: decoded.id });
    if (!user) return next(appError(400, "找不到對應的使用者", next));

    const existingCategory = await categoryRepo.findOneBy({ id: category_id });
    if (!existingCategory) return next(appError(400, "無效的 category", next));

    const newProject = projectRepo.create({
      title,
      summary,
      category: existingCategory,
      total_amount,
      start_time,
      end_time,
      cover,
      full_content,
      project_team,
      faq,
      user
    });

    const savedProject = await projectRepo.save(newProject);

    res.status(200).json({
      status: true,
      message: "專案建立成功",
      data: { project_id: savedProject.id }
    });
  } catch (err) {
    logger.error("新增專案失敗", err);
    next(appError(400, err.message || "欄位填寫不完整或有誤", next));
  }
}

function checkMissingProjectFields(body) {
  const requiredFields = [
    "title",
    "summary",
    "category_id",
    "total_amount",
    "start_time",
    "end_time",
    "cover",
    "full_content",
    "project_team",
    "faq"
  ];
  return requiredFields.filter(field => !body[field]);
}

//  步驟二：建立方案
async function createProjectPlan(req, res, next) {
  try {
    const planRepo = dataSource.getRepository("ProjectPlans");
    const projectRepo = dataSource.getRepository("Projects");

    const projectId = parseInt(req.params.id, 10);
    const { plan_name, amount, quantity, feedback, feedback_img, delivery_date } = req.body.plans;

    const project = await projectRepo.findOneBy({ id: projectId });
    if (!project) {
      return res.status(404).json({ status: false, message: "找不到專案" });
    }

    const newPlan = planRepo.create({
      plan_name,
      amount,
      quantity,
      feedback,
      feedback_img,
      delivery_date,
      project
    });

    await planRepo.save(newPlan);

    res.status(201).json({
      status: true,
      message: "回饋方案建立成功",
      data: newPlan
    });
  } catch (err) {
    console.error("建立回饋方案失敗", err);
    next(appError(500, err.message || "回饋方案建立錯誤", next));
  }
}

// 查詢專案與所有方案
async function getProject(req, res, next) {
  const projectId = parseInt(req.params.project_id, 10);
  try {
    const projectRepository = dataSource.getRepository("Projects");
    const project = await projectRepository.findOne({
      where: { id: projectId },
      relations: ["projectPlans"]
    });

    if (!project) {
      return next(appError(404, "無此專案"));
    }

    const sortedPlans = project.projectPlans.sort((a, b) => a.plan_id - b.plan_id);
    const plans = sortedPlans.map(plan => ({
      plan_name: plan.plan_name,
      amount: plan.amount,
      quantity: plan.quantity,
      feedback: plan.feedback,
      feedback_img: plan.feedback_img,
      delivery_date: plan.delivery_date
    }));

    const responseData = {
      title: project.title,
      summary: project.summary,
      category: project.category,
      total_amount: project.total_amount,
      start_time: project.start_time,
      end_time: project.end_time,
      cover: project.cover,
      full_content: project.full_content,
      project_team: project.project_team,
      faq: project.faq || [],
      plans
    };

    res.status(200).json({
      status: true,
      data: responseData
    });
  } catch (error) {
    logger.error("獲取專案資料失敗", error);
    next(error);
  }
}

//  更新專案或方案
async function updateProject(req, res, next) {
  try{
    const projectId = parseInt(req.params.project_id, 10);
    const user = req.user;
    const projectRepo = dataSource.getRepository("Projects");
    const planRepo = dataSource.getRepository("ProjectPlans");

    const project = await projectRepo.findOne({
      where : {id: projectId, user_id: user.id},
      relations: ["user", "category"]
    });
    if (!project){
      return next(appError(400, "找不到提案"));
    }
    if (project.user.id !== user.id){
      return next(appError(403, "你沒有修改此提案的權限"));
    }

    const {
      title,
      summary,
      category_id,
      total_amount,
      start_time,
      end_time,
      cover,
      full_content,
      project_team,
      faq,
      plans
    } = req.body

    // 更新有變更的欄位
    if (title !== undefined) project.title = title;
    if (summary !== undefined) project.summary = summary;
    if (total_amount !== undefined) project.total_amount = Number(total_amount);
    if (start_time !== undefined) project.start_time = start_time;
    if (end_time !== undefined) project.end_time = end_time;
    if (cover !== undefined) project.cover = cover;
    if (full_content !== undefined) project.full_content = full_content;
    if (project_team !== undefined) project.project_team = project_team;
    if (faq !== undefined) project.faq = faq;

    if (Array.isArray(req.body.plans)){
      // 刪除原來plan陣列
      await planRepo.delete({project:{id:projectId}});
      // 建立新的plan陣列
      const newPlans = req.body.plans.map(plan =>{
        return planRepo.create({
          plan_name: plan.plan_name,
          amount: Number(plan.amount),
          quantity: plan.quantity ? Number(plan.quantity):0,
          feedback: plan.feedback,
          feedback_img: plan.feedback_img,
          delivery_date: plan.delivery_date,
          project
        });
      });
      await planRepo.save(newPlans);
    }
    const updateProject = await projectRepo.save(project);
    res.status(200).json({
      status: true,
      data: { project_id: updateProject.id}
    })
  } catch (error) {
    logger.error("更新失敗", error);
    next(error);
  }
}

module.exports = {
  createProject,
  createProjectPlan,
  getProject,
  updateProject
};
