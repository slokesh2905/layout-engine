# Reset history to initial commit (keep all files in working directory)
git reset cead1fb0b5b6ae0c04c82f816b8e577e22936e8e

# 1. Feature: Font Scaling & Text Measurement
git add src/resolver.ts src/lib/textMeasure.ts
git commit -m "feat(resolver): implement constraint-based font scaling heuristic"

# 2. Feature: Animated Transitions
git add src/components/studio/PreviewCanvas.css src/components/studio/PreviewCanvas.tsx src/components/studio/ResolvedElementView.tsx
git commit -m "feat(studio): add FLIP-based animated transitions for layout reflows"

# 3. Feature: Export Functionality (PNG/SVG)
git add src/lib/exportPng.ts src/lib/exportSvg.ts src/lib/specBundle.ts src/lib/specFile.ts src/components/studio/StudioTopBar.tsx src/components/studio/StudioTopBar.css
git commit -m "feat(export): implement PNG and SVG layout export functionality"

# 4. Feature: Import Functionality (SVG & JSON)
git add src/lib/importSvg.ts src/components/studio/PasteImportModal.tsx src/components/studio/PasteImportModal.css src/components/studio/NewSpecModal.tsx src/components/studio/NewSpecModal.css src/components/ui/Dropdown.tsx src/components/ui/Dropdown.css
git commit -m "feat(import): support importing ad specs via SVG and JSON"

# 5. Feature: API and Storage extensions
git add src/lib/api.ts src/lib/draftStorage.ts src/lib/customSpecStorage.ts src/lib/editHistory.ts src/lib/layoutDiff.ts src/lib/localResolve.ts src/spec.ts src/demoSpec.ts src/lib/types.ts src/lib/contrast.ts src/app/App.tsx src/components/ui/Icon.tsx src/styles/globals.css
git commit -m "feat(core): extend data modeling and storage for offline studio support"

# 6. Style: UI Polish
git add src/components/studio/LayoutStudioPage.css src/components/studio/LayoutStudioPage.tsx src/components/studio/ResolutionPanel.css src/components/studio/ResolutionPanel.tsx src/components/studio/SpecInspector.css src/components/studio/SpecInspector.tsx src/components/studio/StudioHeader.css src/pages/SpecsPage.css src/pages/SpecsPage.tsx test/resolver.test.ts
git commit -m "style(studio): optimize layout inspector density and refine UI typography"

# 7. Docs: Assignment Submission Docs
git add README.md ARCHITECTURE.md EXTENDED-BUILD.md pitch.md
git commit -m "docs: finalize documentation and README for assignment submission"

# 8. Catch-all for any remaining untracked/modified files just in case
git add .
git commit -m "chore: minor cleanups and boilerplate updates"
