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
  // ... (此函式內容不變，為求簡潔省略)
}

// --- 功能 2: 讀取最近一週更新的 Issues ---
async function getRecentlyUpdatedIssues() {
  // ... (此函式內容不變，為求簡潔省略)
}

// --- 功能 3: 讀取本週更新的 Issues 並依狀態分組 ---
async function getWeeklyUpdatedIssues() {
  const searchUrl = `${JIRA_HOST}/rest/api/3/search`;

  // 1. 計算本週的星期一和星期五日期
  const today = new Date();
  const dayOfWeek = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  monday.setHours(0, 0, 0, 0);

  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);
  friday.setHours(23, 59, 59, 999);

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
      maxResults: 50
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


// --- 主程式邏輯 ---
async function main() {
  if (!JIRA_HOST || !JIRA_USER || !JIRA_API_TOKEN) {
    console.error('請確認 .env 檔案中已設定 JIRA_HOST, JIRA_USER, 和 JIRA_API_TOKEN');
    return;
  }

  const args = process.argv.slice(2);
  const showUpdated = args.includes('--updated');
  const showWeekly = args.includes('--weekly');

  try {
    if (showWeekly) {
      await getWeeklyUpdatedIssues();
    } else if (showUpdated) {
      // 為了簡潔，省略 getRecentlyUpdatedIssues 的實作
      console.log('getRecentlyUpdatedIssues function is omitted for brevity.');
    } else {
      // 為了簡潔，省略 getAllBoardIssuesAndPrepareSummary 的實作
      console.log('getAllBoardIssuesAndPrepareSummary function is omitted for brevity.');
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