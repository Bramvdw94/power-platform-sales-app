"""
register_plugin_package.py -- push the SalesApp plug-in package to dev-salesapp (issue #92).

Builds plugins/SalesApp.Plugins and creates (first run) or updates the plug-in
package row vibe_SalesApp.Plugins in the SalesApp solution. Step registration
for the process engine comes with its own ticket; the foundation package ships
one placeholder plug-in type and no steps.

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
sys.exit(0 if r.ok else 1)
