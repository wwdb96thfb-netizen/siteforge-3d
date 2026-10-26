# Sentinel 3D

3D site planning app: build a site model with buildings, roads, walls, gates, posts, cameras, lights and troops; check camera coverage, lighting and blind spots; keep several named projects.

- Works offline once opened (installable on iPhone, iPad and Mac).
- No site data is stored in this repository. Projects are kept on each device; move them between devices with Projects → Export / Open a project file.

## Desktop installers
Raising `version` in `desktop/package.json` and pushing to `main` builds the Windows installer (.exe) and Mac disk image (.dmg) and publishes them as a GitHub Release. Installed apps find the new release and update themselves.
