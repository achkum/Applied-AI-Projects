"""Exercise the real ignoreCommand from repo-root and frontend working directories."""
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
import os

REPO = Path(__file__).resolve().parents[2]
PROJECTS = {"BreastCancerDetection": "BreastCancerDetection/", "TokenOptimizer": "TokenOptimizer/frontend/"}

class IgnoreCommands(unittest.TestCase):
 def exercise(self, project, changed, expected, branch="st/maintenance", parent=True):
  command=json.loads((REPO/project/"frontend/vercel.json").read_text())["ignoreCommand"]
  with tempfile.TemporaryDirectory(prefix="vercel test ") as tmp:
   root=Path(tmp)
   def git(*args):
    return subprocess.run(["git","-C",str(root),*args],check=True,capture_output=True)
   git("init","-q")
   for p in ["BreastCancerDetection/frontend/index.html","TokenOptimizer/frontend/index.html","TokenOptimizer/backend/app.py","SubTrack/README.md"]:
    file=root/p;file.parent.mkdir(parents=True,exist_ok=True);file.write_text("initial")
   git("add",".");git("-c","user.name=Ignore test","-c","user.email=ignore@example.invalid","commit","-qm","initial")
   if parent:
    (root/changed).write_text("changed")
    git("add",".");git("-c","user.name=Ignore test","-c","user.email=ignore@example.invalid","commit","-qm","change")
   for cwd in [root,root/project/"frontend"]:
    result=subprocess.run(["sh","-c",command],cwd=cwd,env={**os.environ,"VERCEL_GIT_COMMIT_REF":branch},capture_output=True)
    self.assertEqual(result.returncode==0,expected,(project,changed,str(cwd),result.stderr.decode()))
 def test_subtrack_changes_ignore_both_projects(self):
  for p in PROJECTS:
   for branch in ["st/test","hold/progress","maintenance/fix","main"]:
    self.exercise(p,"SubTrack/README.md",True,branch)
 def test_project_changes_build_even_on_subtrack_branch(self):
  for p in PROJECTS:self.exercise(p,p+"/frontend/index.html",False)
 def test_unrelated_project_changes_ignored(self):
  self.exercise("BreastCancerDetection","TokenOptimizer/frontend/index.html",True)
  self.exercise("TokenOptimizer","BreastCancerDetection/frontend/index.html",True)
 def test_token_backend_only_ignored(self):
  self.exercise("TokenOptimizer","TokenOptimizer/backend/app.py",True)
 def test_missing_parent_fails_open_to_build(self):
  for p in PROJECTS:self.exercise(p,"SubTrack/README.md",False,parent=False)

if __name__=="__main__":unittest.main()
