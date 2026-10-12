"""
register_plugin_package.py -- push the SalesApp plug-in package to dev-salesapp (issue #92).

Builds plugins/SalesApp.Plugins and creates (first run) or updates the plug-in
package row vibe_SalesApp.Plugins in the SalesApp solution. Then registers the
QuotaGuardPlugin steps (#104): pre-operation, synchronous, Create and Update
of vibe_quota.

Run:  python scripts/register_plugin_package.py
"""

import base64
import glob
import os
import subprocess
import sys

import requests

HERE = os.path.dirname(__file__)
sys.path.insert(0, HERE)
from auth import get_token, load_env  # noqa: E402

load_env()
BASE = os.environ["DATAVERSE_URL"].rstrip("/") + "/api/data/v9.2/"
SOLUTION = os.environ.get("SOLUTION_NAME") or "SalesApp"
NAME = "vibe_SalesApp.Plugins"
PROJECT = os.path.join(HERE, "..", "plugins", "SalesApp.Plugins")
H = {"Authorization": "Bearer " + get_token(), "Accept": "application/json", "Content-Type": "application/json"}

subprocess.run(["dotnet", "build", PROJECT, "-c", "Release"], check=True, stdout=subprocess.DEVNULL)
nupkg = glob.glob(os.path.join(PROJECT, "bin", "Release", "SalesApp.Plugins.*.nupkg"))[0]
content = base64.b64encode(open(nupkg, "rb").read()).decode()

found = requests.get(BASE + f"pluginpackages?$select=pluginpackageid&$filter=name eq '{NAME}'", headers=H).json()["value"]
if found:
    r = requests.patch(BASE + f"pluginpackages({found[0]['pluginpackageid']})", headers=H, json={"content": content})
    print("updated" if r.ok else r.text)
else:
    r = requests.post(BASE + "pluginpackages", headers={**H, "MSCRM.SolutionUniqueName": SOLUTION},
                      json={"name": NAME, "version": "1.0.0", "content": content})
    print("created" if r.ok else r.text)
if not r.ok:
    sys.exit(1)

STEPS = [
    ("QuotaGuardPlugin", "Create", "vibe_quota", None),
    ("QuotaGuardPlugin", "Update", "vibe_quota", "vibe_salespersonid,vibe_month,vibe_amount,ownerid"),
]
S = {**H, "MSCRM.SolutionUniqueName": SOLUTION}
for typename, message, table, attrs in STEPS:
    t = requests.get(BASE + f"plugintypes?$select=plugintypeid&$filter=endswith(typename,'.{typename}')", headers=H).json()["value"]
    if not t:
        sys.exit(f"plug-in type {typename} not found; wait a minute and re-run")
    tid = t[0]["plugintypeid"]
    mid = requests.get(BASE + f"sdkmessages?$select=sdkmessageid&$filter=name eq '{message}'", headers=H).json()["value"][0]["sdkmessageid"]
    fid = requests.get(BASE + f"sdkmessagefilters?$select=sdkmessagefilterid&$filter=primaryobjecttypecode eq '{table}' and _sdkmessageid_value eq {mid}", headers=H).json()["value"][0]["sdkmessagefilterid"]
    name = f"{typename}: {message} of {table}"
    body = {
        "name": name, "stage": 20, "mode": 0, "rank": 1, "supporteddeployment": 0,
        "plugintypeid@odata.bind": f"/plugintypes({tid})",
        "sdkmessageid@odata.bind": f"/sdkmessages({mid})",
        "sdkmessagefilterid@odata.bind": f"/sdkmessagefilters({fid})",
    }
    if attrs:
        body["filteringattributes"] = attrs
    have = requests.get(BASE + f"sdkmessageprocessingsteps?$select=sdkmessageprocessingstepid&$filter=name eq '{name}'", headers=H).json()["value"]
    if have:
        print("= step", name)
        continue
    r = requests.post(BASE + "sdkmessageprocessingsteps", headers=S, json=body)
    print("+ step" if r.ok else r.text, name)
    if not r.ok:
        sys.exit(1)
