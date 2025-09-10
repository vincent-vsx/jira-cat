require('dotenv').config();
const axios = require('axios');

// 從 .env 檔案讀取 Jira 設定
const JIRA_HOST = process.env.JIRA_HOST;
const JIRA_USER = process.env.JIRA_USER;
const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN;

// --- API 設定 ---
const jiraApiConfig = {
  headers: {
    'Accept': 'application/json',
    'Authorization': `Basic ${Buffer.from(
      `${JIRA_USER}:${JIRA_API_TOKEN}`
    ).toString('base64')}`
  }
};

// --- 功能 1: 讀取看板上所有 Issues 並準備總結 ---
async function getAllBoardIssuesAndPrepareSummary() {
  const boardId = '292';
  const baseUrl = `${JIRA_HOST}/rest/agile/1.0/board/${boardId}/issue`;
  let allIssues = [];
  let startAt = 0;
  let isLast = false;

  console.log(`正在從 board ${boardId} 讀取所有 issues (包含分頁)...`);

  while (!isLast) {
    const url = `${baseUrl}?startAt=${startAt}`;
    const response = await axios.get(url, jiraApiConfig);
    const fetchedIssues = response.data.issues;

    if (fetchedIssues && fetchedIssues.length > 0) {
      allIssues = allIssues.concat(fetchedIssues);
    }

    isLast = response.data.isLast;
    startAt += (fetchedIssues || []).length;

    if (isLast || (fetchedIssues || []).length === 0) {
      break;
    }
  }

  console.log(`總共取得 ${allIssues.length} 個 issues!`);
  console.log(`================`);
  console.log("請將以下內容複製到 LLM 中以產生總結：");
  console.log("================\n");

  let summaryText = "請幫我總結以下 Jira issue 列表，分析其中的主要開發項目、bug 修復和潛在的風險：\n\n";
  allIssues.forEach(issue => {
    summaryText += `- [${issue.key}] ${issue.fields.summary}\n`;
  });

  console.log(summaryText);
}

// --- 功能 2: 讀取最近一週更新的 Issues ---
async function getRecentlyUpdatedIssues() {
  const searchUrl = `${JIRA_HOST}/rest/api/3/search`;
  const jql = 'project = CSMAC AND updated >= -1w ORDER BY updated DESC';

  console.log('正在讀取過去一週內更新的 issues...');
  console.log(`JQL: ${jql}`);

  const response = await axios.post(searchUrl, { jql }, jiraApiConfig);
  const issues = response.data.issues;

  console.log(`================`);
  console.log(`總共取得 ${issues.length} 個最近更新的 issues!`);
  console.log(`================\n`);

  issues.forEach(issue => {
    const updatedTime = new Date(issue.fields.updated).toLocaleString();
    console.log(`- [${issue.key}] ${issue.fields.summary} (更新於: ${updatedTime})`);
  });
}

// --- 功能 3: 讀取本週更新的 Issues 並依狀態分組 ---
async function getWeeklyUpdatedIssues() {
  const searchUrl = `${JIRA_HOST}/rest/api/3/search`;

  // 1. 計算本週的星期一和星期五日期
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0 (週日) - 6 (週六)
  const monday = new Date(today);
  // 如果今天是週日(0)，則往前推6天；否則往前推 (dayOfWeek - 1) 天
  monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  monday.setHours(0, 0, 0, 0); // 設定為當天零點

  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);
  friday.setHours(23, 59, 59, 999); // 設定為當天午夜

  // 將日期格式化為 YYYY-MM-DD
  const formatDate = (date) => date.toISOString().split('T')[0];
  const startDate = formatDate(monday);
  const endDate = formatDate(friday);

  // 2. 組合 JQL
  const jql = `project = CSMAC AND updated >= '${startDate}' AND updated <= '${endDate}' ORDER BY updated DESC`;

  console.log('正在讀取本週更新的 issues...');
  console.log(`查詢期間: ${startDate} 到 ${endDate}`);
  console.log(`JQL: ${jql}`);

  // 3. 呼叫 API (包含分頁邏輯)
  let allIssues = [];
  let startAt = 0;
  let isLast = true;

  do {
    const response = await axios.post(searchUrl, { 
      jql, 
      startAt,
      maxResults: 50 // 一次讀取50筆
    }, jiraApiConfig);
    
    const issues = response.data.issues;
    if (issues && issues.length > 0) {
      allIssues = allIssues.concat(issues);
    }

    const total = response.data.total;
    startAt += (issues || []).length;
    isLast = startAt >= total;

  } while (!isLast);

  // 4. 依照狀態分組
  const groupedIssues = allIssues.reduce((groups, issue) => {
    const status = issue.fields.status.name;
    if (!groups[status]) {
      groups[status] = [];
    }
    groups[status].push(issue);
    return groups;
  }, {});

  console.log(`================`);
  console.log(`總共取得 ${allIssues.length} 個本週更新的 issues!`);
  console.log(`================\n`);

  // 5. 依照分組後的狀態印出
  for (const status in groupedIssues) {
    console.log(`--- ${status} ---`);
    groupedIssues[status].forEach(issue => {
      const updatedTime = new Date(issue.fields.updated).toLocaleString();
      console.log(`- [${issue.key}] ${issue.fields.summary} (更新於: ${updatedTime})`);
    });
    console.log('\n'); // 每組之間加個換行
  }
}

// --- 功能 4: 產生指定使用者的每日報告 ---
async function getDailyReportForUser(userName) {
  const searchUrl = `${JIRA_HOST}/rest/api/3/search`;
  const todayStr = new Date().toISOString().split('T')[0];

  console.log(`正在為 ${userName} 產生今日報告...`);
  console.log(todayStr); // 輸出日期

  // 1. 查詢今日完成的議題
  const doneJql = `project = CSMAC AND assignee = "${userName}" AND status changed to ("Done", "Closed") DURING (startOfDay(), endOfDay()) ORDER BY updated DESC`;
  const doneResponse = await axios.post(searchUrl, { jql: doneJql, maxResults: 100 }, jiraApiConfig);
  const doneIssues = doneResponse.data.issues;

  if (doneIssues.length > 0) {
    console.log(`  Done`);
    doneIssues.forEach(issue => {
      console.log(`   * [${issue.key}] ${issue.fields.summary}`);
    });
  }

  // 2. 查詢今日有更新且進行中的議題
  const inProgressJql = `project = CSMAC AND assignee = "${userName}" AND status = "In Progress" AND updated >= startOfDay() ORDER BY updated DESC`;
  const inProgressResponse = await axios.post(searchUrl, { jql: inProgressJql, maxResults: 100 }, jiraApiConfig);
  const inProgressIssues = inProgressResponse.data.issues;

  if (inProgressIssues.length > 0) {
    console.log(`  In Progress`);
    inProgressIssues.forEach(issue => {
      console.log(`   * [${issue.key}] ${issue.fields.summary}`);
    });
  }

  // 3. 查詢待辦事項 (所有指派給該使用者且狀態為 "To Do" 或 "Open" 且在開放 Sprint 中的議題)
  const todoJql = `project = CSMAC AND assignee = "${userName}" AND status in ("To Do", "Open") AND sprint in openSprints() ORDER BY updated DESC`;
  const todoResponse = await axios.post(searchUrl, { jql: todoJql, maxResults: 100 }, jiraApiConfig);
  const todoIssues = todoResponse.data.issues;

  if (todoIssues.length > 0) {
    console.log(`  Todo`);
    todoIssues.forEach(issue => {
      console.log(`   * [${issue.key}] ${issue.fields.summary}`);
    });
  }

  if (doneIssues.length === 0 && inProgressIssues.length === 0 && todoIssues.length === 0) {
    console.log(`今天 ${userName} 沒有相關的票卡更新或待辦事項。`);
  }
}

// --- 功能 5: 產生指定使用者的每日站會報告 ---
async function generateStandupReport(userName) {
  const searchUrl = `${JIRA_HOST}/rest/api/3/search`;
  const todayStr = new Date().toISOString().split('T')[0];

  console.log(`
${todayStr}`);

  // 1. 昨日完成 (Recently Done)
  const doneJql = `project = CSMAC AND issuetype in (standardIssueTypes(), subTaskIssueTypes()) AND assignee = "${userName}" AND status changed to ("Done", "Closed") DURING (startOfDay(-1d), endOfDay(-1d)) ORDER BY updated DESC`;
  const doneResponse = await axios.post(searchUrl, { jql: doneJql, maxResults: 100, expand: ["subtasks"] }, jiraApiConfig);
  const doneIssues = doneResponse.data.issues;

  console.log('Done');
  if (doneIssues.length === 0) {
    console.log('- 無');
  } else {
    doneIssues.forEach(issue => {
      console.log(`- [${issue.key}] ${issue.fields.summary}`);
    });
  }

  // 2. 目前進行中 (In Progress)
  const inProgressJql = `project = CSMAC AND issuetype in (standardIssueTypes(), subTaskIssueTypes()) AND assignee = "${userName}" AND status in ("In Progress", "IN CODE REVIEW") ORDER BY updated DESC`;
  const inProgressResponse = await axios.post(searchUrl, { jql: inProgressJql, maxResults: 100, expand: ["subtasks"] }, jiraApiConfig);
  const inProgressIssues = inProgressResponse.data.issues;

  console.log('In Progress');
  if (inProgressIssues.length === 0) {
    console.log('- 無');
  } else {
    inProgressIssues.forEach(issue => {
      console.log(`- [${issue.key}] ${issue.fields.summary}`);
    });
  }

  // 3. 我的待辦事項 (My To-Do List)
  const todoJql = `project = CSMAC AND issuetype in (standardIssueTypes(), subTaskIssueTypes()) AND assignee = "${userName}" AND status in ("To Do", "Open") AND sprint in openSprints() ORDER BY updated DESC`;
  const todoResponse = await axios.post(searchUrl, { jql: todoJql, maxResults: 100, expand: ["subtasks"] }, jiraApiConfig);
  const todoIssues = todoResponse.data.issues;

  console.log('Todo');
  if (todoIssues.length === 0) {
    console.log('- 無');
  } else {
    todoIssues.forEach(issue => {
      console.log(`- [${issue.key}] ${issue.fields.summary}`);
    });
  }
}

// --- 功能 6: 產生指定使用者的週報總結 ---
async function generateWeeklySummaryReport() {
  const searchUrl = `${JIRA_HOST}/rest/api/3/search`;

  // 計算本週的星期一日期
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0 (週日) - 6 (週六)
  const monday = new Date(today);
  monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  monday.setHours(0, 0, 0, 0); // 設定為當天零點

  const formatDate = (date) => date.toISOString().split('T')[0];
  const mondayStr = formatDate(monday);

  let reportContent = `--- ${mondayStr} 這週的週報總結 ---\n\n`;

  // 1. 本週完成與進行中 (This Week's Done & In Progress)
  reportContent += '本週完成與進行中:\n';
  const thisWeekJql = `project = CSMAC AND issuetype in (standardIssueTypes(), subTaskIssueTypes()) AND status in ("Done", "Closed", "In Progress") AND updated >= -7d ORDER BY updated DESC`;
  const thisWeekResponse = await axios.post(searchUrl, { jql: thisWeekJql, maxResults: 100 }, jiraApiConfig);
  const thisWeekIssues = thisWeekResponse.data.issues;

  if (thisWeekIssues.length === 0) {
    reportContent += '- 無\n';
  } else {
    const groupedThisWeekIssues = thisWeekIssues.reduce((groups, issue) => {
      const status = issue.fields.status.name;
      if (!groups[status]) {
        groups[status] = [];
      }
      groups[status].push(issue);
      return groups;
    }, {});

    const orderedStatuses = ["In Progress", "IN CODE REVIEW", "PR MERGED", "Done", "CLOSED"];
    orderedStatuses.forEach(status => {
      if (groupedThisWeekIssues[status] && groupedThisWeekIssues[status].length > 0) {
        reportContent += `  --- ${status} ---\n`;
        groupedThisWeekIssues[status].forEach(issue => {
          reportContent += `  - ${JIRA_HOST}/browse/${issue.key}
`;
        });
      }
    });
  }

  // 2. 下週預計完成 (Next Week's Planned Completion)
  reportContent += '\n下週預計完成:\n';
  const nextWeekJql = `project = CSMAC AND issuetype in (standardIssueTypes(), subTaskIssueTypes()) AND status in ("To Do", "Open", "In Progress", "ESTIMATION") AND sprint in openSprints() ORDER BY updated DESC`;
  const nextWeekResponse = await axios.post(searchUrl, { jql: nextWeekJql, maxResults: 100 }, jiraApiConfig);
  const nextWeekIssues = nextWeekResponse.data.issues;

  if (nextWeekIssues.length === 0) {
    reportContent += '- 無\n';
  } else {
    nextWeekIssues.forEach(issue => {      reportContent += `- ${JIRA_HOST}/browse/${issue.key}\n`;    });
  }
  return reportContent;
}


// --- 功能 7: 取得多個 Jira 票卡的詳細資訊並格式化輸出 ---
async function getJiraTicketsFormatted(ticketKeys) {
  const searchUrl = `${JIRA_HOST}/rest/api/3/search`;
  let formattedOutput = [];

  for (let i = 0; i < ticketKeys.length; i++) {
    const key = ticketKeys[i];
    const jql = `key = "${key}"`;
    try {
      const response = await axios.post(searchUrl, { jql, maxResults: 1, fields: ["summary", "status", "assignee", "updated"] }, jiraApiConfig);
      const issue = response.data.issues[0];
      if (issue) {
        const assignee = issue.fields.assignee ? issue.fields.assignee.displayName : '未指派';
        const updatedTime = new Date(issue.fields.updated).toLocaleString();
        formattedOutput.push(`[${issue.key}] ${issue.fields.summary}\n  - 狀態: ${issue.fields.status.name}\n  - 指派給: ${assignee}\n  - 最後更新: ${updatedTime}`);
      } else {
        formattedOutput.push(`${i + 1} 無法找到票卡 ${key}`);
      }
    } catch (error) {
      console.error(`查詢票卡 ${key} 時發生錯誤:`, error.message);
      formattedOutput.push(`${i + 1} 查詢票卡 ${key} 時發生錯誤`);
    }
  }
  return formattedOutput.join('\n');
}

// --- 功能 8: 查詢指定使用者在特定日期完成的議題 ---
async function getDoneIssuesOnDate(userName, dateStr) {
  const searchUrl = `${JIRA_HOST}/rest/api/3/search`;

  console.log(`正在為 ${userName} 查詢 ${dateStr} 完成的議題...`);

  const doneJql = `project = CSMAC AND assignee = "${userName}" AND status changed to ("Done", "Closed") DURING ("${dateStr} 00:00", "${dateStr} 23:59") ORDER BY updated DESC`;
  const doneResponse = await axios.post(searchUrl, { jql: doneJql, maxResults: 100 }, jiraApiConfig);
  const doneIssues = doneResponse.data.issues;

  if (doneIssues.length > 0) {
    console.log(`  Done on ${dateStr}`);
    doneIssues.forEach(issue => {
      console.log(`   * [${issue.key}] ${issue.fields.summary}`);
    });
  } else {
    console.log(`在 ${dateStr}，${userName} 沒有完成任何議題。`);
  }
}

// --- 功能 9: 除錯用 - 查詢指定使用者所有已關閉的 Sub-task ---
async function debugSubTasks(userName) {
  const searchUrl = `${JIRA_HOST}/rest/api/3/search`;
  console.log(`--- DEBUG: 正在為 ${userName} 查詢所有已關閉的 Sub-task ---`);

  const jql = `project = CSMAC AND issuetype = "Sub-task" AND assignee = "${userName}" AND status in ("Closed", "Done")`;
  
  try {
    const response = await axios.post(searchUrl, { jql, maxResults: 100 }, jiraApiConfig);
    const issues = response.data.issues;

    if (issues.length > 0) {
      console.log(`找到 ${issues.length} 個已關閉的 Sub-task:`);
      issues.forEach(issue => {
        console.log(`- [${issue.key}] ${issue.fields.summary} (Status: ${issue.fields.status.name})`);
      });
    } else {
      console.log("沒有找到任何已關閉的 Sub-task。");
    }
  } catch (error) {
    console.error("除錯查詢時發生錯誤:", error.message);
  }
  console.log("--- DEBUG: 查詢結束 ---");
}


module.exports = {
  getAllBoardIssuesAndPrepareSummary,
  getRecentlyUpdatedIssues,
  getWeeklyUpdatedIssues,
  getDailyReportForUser,
  generateStandupReport,
  generateWeeklySummaryReport,
  getJiraTicketsFormatted,
  getDoneIssuesOnDate,
  debugSubTasks
};

// --- 主程式邏輯 ---
async function main() {
  if (!JIRA_HOST || !JIRA_USER || !JIRA_API_TOKEN) {
    console.error('請確認 .env 檔案中已設定 JIRA_HOST, JIRA_USER, 和 JIRA_API_TOKEN');
    return;
  }

  const args = process.argv.slice(2);
  const dailyIndex = args.indexOf('--daily');
  const standupIndex = args.indexOf('--standup');
  const weeklySummaryIndex = args.indexOf('--weekly-summary');
  const doneOnIndex = args.indexOf('--done-on');
  const showWeekly = args.includes('--weekly');
  const showUpdated = args.includes('--updated');
  const debugSubtasksIndex = args.indexOf('--debug-subtasks');
  const getTicketIndex = args.indexOf('--get-ticket');

  try {
    if (weeklySummaryIndex !== -1) {
      const outputIndex = args.indexOf('--output');
      let outputPath = null;
      if (outputIndex !== -1) {
        outputPath = args[outputIndex + 1];
        if (!outputPath) {
          console.error('錯誤：請在 --output 參數後提供檔案名稱。');
          return;
        }
      }

      const reportContent = await generateWeeklySummaryReport();

      if (outputPath) {
        const fs = require('fs');
        const path = require('path');
        const absolutePath = path.resolve(outputPath);
        fs.writeFileSync(absolutePath, reportContent);
        console.log(`週報已儲存至 ${absolutePath}`);
      } else {
        console.log(reportContent);
      }
    } else if (standupIndex !== -1) {
      const userName = args[standupIndex + 1];
      if (!userName) {
        console.error('錯誤：請在 --standup 參數後提供使用者名稱。');
        return;
      }
      await generateStandupReport(userName);
    } else if (dailyIndex !== -1) {
      const userName = args[dailyIndex + 1];
      if (!userName) {
        console.error('錯誤：請在 --daily 參數後提供使用者名稱。');
        return;
      }
      await getDailyReportForUser(userName);
    } else if (doneOnIndex !== -1) {
      const userName = args[doneOnIndex + 1];
      const date = args[doneOnIndex + 2];
      if (!userName || !date) {
        console.error('錯誤：請在 --done-on 參數後提供使用者名稱和日期 (YYYY-MM-DD)。');
        return;
      }
      await getDoneIssuesOnDate(userName, date);
    } else if (debugSubtasksIndex !== -1) {
      const userName = args[debugSubtasksIndex + 1];
      if (!userName) {
        console.error('錯誤：請在 --debug-subtasks 參數後提供使用者名稱。');
        return;
      }
      await debugSubTasks(userName);
    } else if (getTicketIndex !== -1) {
      const ticketKey = args[getTicketIndex + 1];
      if (!ticketKey) {
        console.error('錯誤：請在 --get-ticket 參數後提供票卡號碼。');
        return;
      }
      const ticketInfo = await getJiraTicketsFormatted([ticketKey]);
      console.log(ticketInfo);
    } else if (showWeekly) {
      await getWeeklyUpdatedIssues();
    } else if (showUpdated) {
      await getRecentlyUpdatedIssues();
    } else {
      await getAllBoardIssuesAndPrepareSummary();
    }
  } catch (error) {
    console.error('執行過程中發生錯誤:');
    if (error.response) {
      console.error(`  狀態碼: ${error.response.status}`);
      console.error('  錯誤訊息:', error.response.data.errorMessages ? error.response.data.errorMessages.join(', ') : error.response.data);
    } else {
      console.error('  錯誤:', error.message);
    }
  }
}

// 執行
main();