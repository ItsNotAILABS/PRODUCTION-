#!/usr/bin/env python3
"""Operator CLI — create accounts, mint and revoke keys, inspect usage.

Deliberately not exposed over HTTP. Account creation is the one operation that
must not be reachable from the internet on a self-hosted deployment, so it
lives behind shell access to the box.

    python3 admin.py account create ops@acme.com --plan business
    python3 admin.py key issue acct_1234 --label ci
    python3 admin.py key revoke ci_AbC123
    python3 admin.py usage acct_1234
"""
import argparse
import json
import os

from codeintel.billing import PLANS, Billing


def main():
    ap = argparse.ArgumentParser(description="codeintel operator CLI")
    ap.add_argument("--db", default=os.environ.get("CODEINTEL_DB", "codeintel.db"))
    sub = ap.add_subparsers(dest="group", required=True)

    a = sub.add_parser("account").add_subparsers(dest="cmd", required=True)
    ac = a.add_parser("create"); ac.add_argument("email")
    ac.add_argument("--plan", default="free", choices=sorted(PLANS))

    k = sub.add_parser("key").add_subparsers(dest="cmd", required=True)
    ki = k.add_parser("issue"); ki.add_argument("account_id"); ki.add_argument("--label", default="default")
    kr = k.add_parser("revoke"); kr.add_argument("prefix")

    u = sub.add_parser("usage"); u.add_argument("account_id"); u.add_argument("--days", type=int, default=30)
    sub.add_parser("plans")

    args = ap.parse_args()
    b = Billing(args.db)

    if args.group == "plans":
        print(json.dumps([p.as_dict() for p in PLANS.values()], indent=2)); return
    if args.group == "account":
        print(json.dumps(b.create_account(args.email, args.plan), indent=2)); return
    if args.group == "key":
        if args.cmd == "issue":
            print(json.dumps(b.issue_key(args.account_id, args.label), indent=2))
        else:
            print(json.dumps({"revoked": b.revoke_key(args.prefix)}, indent=2))
        return
    print(json.dumps(b.usage_summary(args.account_id, args.days), indent=2))


if __name__ == "__main__":
    main()
