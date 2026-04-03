ISSUE_KEY_PATTERN = r"^[A-Z][A-Z0-9_]+-\d+$"
PROJECT_KEY_PATTERN = r"^[A-Z][A-Z0-9_]+$"
DEFAULT_READ_JIRA_FIELDS = (
    "summary,status,assignee,reporter,priority,issuetype,"
    "created,updated,description,comment,labels,components,fixVersions,epic"
)
DEFAULT_COMMENT_LIMIT = 10
DEFAULT_PAGE_LIMIT = 10
MAX_PAGE_LIMIT = 50
