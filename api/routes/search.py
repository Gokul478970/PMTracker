from fastapi import APIRouter

from pmtracker.store import json_store
from pmtracker.tools.issues import parse_jql

router = APIRouter(tags=["search"])


@router.get("/search")
def search_issues(jql: str = "", q: str = "", start: int = 0, limit: int = 50):
    issues = json_store.get_issues()
    if jql.strip():
        predicate = parse_jql(jql)
        issues = [i for i in issues if predicate(i)]
    if q.strip():
        q_lower = q.strip().lower()
        issues = [
            i for i in issues
            if q_lower in (i["fields"].get("summary", "") or "").lower()
            or q_lower in (i["fields"].get("description", "") or "").lower()
            or q_lower in (i.get("key", "") or "").lower()
        ]
    total = len(issues)
    page = issues[start: start + limit]
    return {"total": total, "start": start, "limit": limit, "issues": page}
