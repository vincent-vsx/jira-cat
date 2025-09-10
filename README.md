# Jira Cat

A simple Node.js command-line tool to connect to Jira, fetch issues, and generate reports.

## Features

- **Board Summary**: Fetches all issues from a specific Jira Agile board and prepares a text block for an LLM to summarize.
- **Recent Updates**: Fetches all issues updated in the last week.
- **Weekly Report**: Generates a report of all issues updated in the current week (from Monday to Friday), grouped by their current status.
- **Daily Standup Report**: Generates a daily report for a specific user, categorized into recently done, in progress, and to-do items.

## Setup

1.  **Install Dependencies**:
    ```bash
    npm install
    ```

2.  **Create Environment File**:
    Create a `.env` file in the root of the project. Copy the format from `.env.example` if it exists, or use the template below:

    ```
    JIRA_HOST=https://your-domain.atlassian.net
    JIRA_USER=your-email@example.com
    JIRA_API_TOKEN=your-api-token
    ```

    - `JIRA_HOST`: The base URL of your Jira instance.
    - `JIRA_USER`: The email address you use to log in to Jira.
    - `JIRA_API_TOKEN`: Your personal API token. You can generate one [here](https://support.atlassian.com/atlassian-account/docs/manage-api-tokens-for-your-atlassian-account/).

## Usage

Execute the script using `node` from your terminal. You can use different command-line flags to trigger different functionalities.

### Generate Weekly Report

To get a list of all issues updated in the current week, grouped by status:

```bash
node index.js --weekly
```

### Get Recently Updated Issues

To get a list of all issues updated in the last 7 days:

```bash
node index.js --updated
```

### Get Full Board Summary

To get a list of all issues on the board, formatted for an LLM summary:

```bash
node index.js
```

### Generate Daily Standup Report

To get a daily standup report for a specific user:

```bash
node index.js --standup "Your User Name"
```
Replace `"Your User Name"` with the actual display name of the user in Jira.

### Generate Weekly Summary Report

To get a weekly summary report for the entire project, including completed and in-progress items for the current week, and planned items for the current sprint. The report will include Jira links for each issue.

```bash
node index.js --weekly-summary [--output <filename>]
```

- If `--output <filename>` is provided, the report will be saved to the specified file. Otherwise, it will be printed to the console.

## Dependencies

- [axios](https://axios-http.com/): For making HTTP requests to the Jira API.
- [dotenv](https://github.com/motdotla/dotenv): For loading environment variables from a `.env` file.