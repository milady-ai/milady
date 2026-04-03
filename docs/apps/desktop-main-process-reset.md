---
title: "Desktop Main-Process Reset"
sidebarTitle: "Desktop Reset"
description: "Reset behavior should stay coordinated between the renderer and the Electrobun main process."
---

The desktop reset flow is main-process sensitive because it can involve:

- native confirmation UI
- API reachability checks
- renderer state clearing
- local startup persistence clearing

Keep reset behavior consistent with the active startup persistence model.
