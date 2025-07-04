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

// --- (此處省略功能 1 和 2 的程式碼以求簡潔) ---

// --- 功能 3: 讀取本週更新的 Issues 並依狀態分組 ---
async function getWeeklyUpdatedIssues() {
  // ... (此函式內容不變，為求簡潔省略)
}

// --- 功能 4: 產生指定使用者的每日報告 ---
async function getDailyReportForUser(userName) {
  const searchUrl = `${JIRA_HOST}/rest/api/3/search`;

  // 1. 組合 JQL
  const jql = `project = CSMAC AND assignee = "${userName}" AND updated >= startOfDay() ORDER BY updated DESC`;

  console.log(`正在為 ${userName} 產生今日報告...`);
  console.log(`JQL: ${jql}`);

  // 2. 呼叫 API
  const response = await axios.post(searchUrl, { jql, maxResults: 100 }, jiraApiConfig);
  const issues = response.data.issues;

  // 3. 依照狀態分組
  const groupedIssues = issues.reduce((groups, issue) => {
    const status = issue.fields.status.name;
    if (!groups[status]) {
      groups[status] = [];
    }
    groups[status].push(issue);
    return groups;
  }, {});

  // 4. 產生報告
  const todayStr = new Date().toISOString().split('T')[0];
  console.log(`\n--- ${todayStr} ---`);

  if (issues.length === 0) {
    console.log(`今天 ${userName} 沒有更新的票卡。`);
    return;
  }

  for (const status in groupedIssues) {
    console.log(`\n${status}`);
    groupedIssues[status].forEach(issue => {
      console.log(`[${issue.key}] ${issue.fields.summary}`);
    });
  }
}


// --- 主程式邏輯 ---
async function main() {
  if (!JIRA_HOST || !JIRA_USER || !JIRA_API_TOKEN) {
    console.error('請確認 .env 檔案中已設定 JIRA_HOST, JIRA_USER, 和 JIRA_API_TOKEN');
    return;
  }

  const args = process.argv.slice(2);
  const dailyIndex = args.indexOf('--daily');
  const showWeekly = args.includes('--weekly');
  const showUpdated = args.includes('--updated');

  try {
    if (dailyIndex !== -1) {
      const userName = args[dailyIndex + 1];
      if (!userName) {
        console.error('錯誤：請在 --daily 參數後提供使用者名稱。');
        return;
      }
      await getDailyReportForUser(userName);
    } else if (showWeekly) {
      // 為了簡潔，省略 getWeeklyUpdatedIssues 的實作
      console.log('getWeeklyUpdatedIssues function is omitted for brevity.');
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