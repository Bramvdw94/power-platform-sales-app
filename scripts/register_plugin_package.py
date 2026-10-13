"""
register_plugin_package.py -- push the SalesApp plug-in package to dev-salesapp (issue #92).

Builds plugins/SalesApp.Plugins and creates (first run) or updates the plug-in
package row vibe_SalesApp.Plugins in the SalesApp solution. Then registers the
steps, all synchronous:
  * QuotaGuardPlugin (#104): pre-operation, Create and Update of vibe_quota
  * ProcessEnginePlugin (#94): pre-operation, Create and Update of vibe_lead,
    vibe_opportunity, account and contact; post-operation (the Action Tasks, in
    the same transaction), Create and Update of vibe_lead and vibe_opportunity
  * ProductLinePlugin (#100): pre-operation, Create, Update and Delete of vibe_productline
  * ProductLineTotalPlugin (#100): post-operation, Create, Update and Delete of vibe_productline
  * EstimatedValueGuardPlugin (#100): pre-operation, Update of vibe_opportunity's Estimated value
  * QuotePlugin (#101): pre-operation, Create, Update and Delete of vibe_quote
  * QuoteLinePlugin (#101): pre-operation, Create, Update and Delete of vibe_quoteline
  * QuoteTotalPlugin (#101): post-operation, Create, Update and Delete of vibe_quoteline

Run:  python scripts/register_plugin_package.py
      (PLUGIN_PROJECT=<dir> builds another copy of the project, e.g. to push two unmerged branches together)
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
PROJECT = os.environ.get("PLUGIN_PROJECT") or os.path.join(HERE, "..", "plugins", "SalesApp.Plugins")
H = {"Authorization": "Bearer " + get_token(), "Accept": "application/json", "Content-Type": "application/json"}

# The build packs only when it recompiles; a stale package would silently push old code.
for _old in glob.glob(os.path.join(PROJECT, "bin", "Release", "SalesApp.Plugins.*.nupkg")):
    os.remove(_old)
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

# (type, message, table, filtering attributes, stage: 20 pre-operation / 40 post-operation)
STEPS = [
    ("QuotaGuardPlugin", "Create", "vibe_quota", None, 20),
    ("QuotaGuardPlugin", "Update", "vibe_quota", "vibe_salespersonid,vibe_month,vibe_amount,ownerid", 20),
    ("ProductLinePlugin", "Create", "vibe_productline", None, 20),
    ("ProductLinePlugin", "Update", "vibe_productline",
     "vibe_quantity,vibe_unitprice,vibe_discountpercent,vibe_description,vibe_opportunityid,vibe_productid,vibe_listpriceatadd,vibe_lineamount", 20),
    ("ProductLinePlugin", "Delete", "vibe_productline", None, 20),
    ("ProductLineTotalPlugin", "Create", "vibe_productline", None, 40),
    ("ProductLineTotalPlugin", "Update", "vibe_productline", None, 40),
    ("ProductLineTotalPlugin", "Delete", "vibe_productline", None, 40),
    ("EstimatedValueGuardPlugin", "Update", "vibe_opportunity", "vibe_estimatedvalue", 20),
    ("QuotePlugin", "Create", "vibe_quote", None, 20),
    ("QuotePlugin", "Update", "vibe_quote", None, 20),
    ("QuotePlugin", "Delete", "vibe_quote", None, 20),
    ("QuoteLinePlugin", "Create", "vibe_quoteline", None, 20),
    ("QuoteLinePlugin", "Update", "vibe_quoteline", None, 20),
    ("QuoteLinePlugin", "Delete", "vibe_quoteline", None, 20),
    ("QuoteTotalPlugin", "Create", "vibe_quoteline", None, 40),
    ("QuoteTotalPlugin", "Update", "vibe_quoteline", None, 40),
    ("QuoteTotalPlugin", "Delete", "vibe_quoteline", None, 40),
]
for _table in ("vibe_lead", "vibe_opportunity", "account", "contact"):
    for _message in ("Create", "Update"):
        STEPS.append(("ProcessEnginePlugin", _message, _table, None, 20))
for _table in ("vibe_lead", "vibe_opportunity"):
    for _message in ("Create", "Update"):
        STEPS.append(("ProcessEnginePlugin", _message, _table, None, 40))
S = {**H, "MSCRM.SolutionUniqueName": SOLUTION}
for typename, message, table, attrs, stage in STEPS:
    t = requests.get(BASE + f"plugintypes?$select=plugintypeid&$filter=endswith(typename,'.{typename}')", headers=H).json()["value"]
    if not t:
        sys.exit(f"plug-in type {typename} not found; wait a minute and re-run")
    tid = t[0]["plugintypeid"]
    mid = requests.get(BASE + f"sdkmessages?$select=sdkmessageid&$filter=name eq '{message}'", headers=H).json()["value"][0]["sdkmessageid"]
    fid = requests.get(BASE + f"sdkmessagefilters?$select=sdkmessagefilterid&$filter=primaryobjecttypecode eq '{table}' and _sdkmessageid_value eq {mid}", headers=H).json()["value"][0]["sdkmessagefilterid"]
    name = f"{typename}: {message} of {table}" + (" (post)" if stage == 40 else "")
    body = {
        "name": name, "stage": stage, "mode": 0, "rank": 1, "supporteddeployment": 0,
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

# After an update, switch every step of this package off and on again. Without it users hit
# "missing prvReadPluginType" on unrelated creates until Dataverse rebuilds its plug-in cache.
types = requests.get(BASE + "plugintypes?$select=plugintypeid&$filter=startswith(typename,'SalesApp.Plugins.')", headers=H).json()["value"]
refreshed = 0
for t in types:
    steps = requests.get(BASE + f"sdkmessageprocessingsteps?$select=sdkmessageprocessingstepid&$filter=_plugintypeid_value eq {t['plugintypeid']}", headers=H).json()["value"]
    for step in steps:
        url = BASE + f"sdkmessageprocessingsteps({step['sdkmessageprocessingstepid']})"
        for state, status in ((1, 2), (0, 1)):
            r = requests.patch(url, headers=H, json={"statecode": state, "statuscode": status})
            if not r.ok:
                sys.exit(r.text)
        refreshed += 1
print(f"refreshed {refreshed} steps")
