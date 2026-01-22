# Skills Library Expansion Plan

## Overview

Expand the Onyx productivity skills system to integrate with the open skills.sh ecosystem while maintaining our curated "recommended" skills from the onyx-skills repo.

## Current State

- Skills are loaded from `https://github.com/derekross/onyx-skills`
- A `manifest.json` defines available skills with metadata
- Skills are downloaded to `~/.config/opencode/skills/`
- Each skill has a `SKILL.md` file that OpenCode reads

## Proposed Architecture

### Two-Tier Skills System

```
┌─────────────────────────────────────────────────────────────────┐
│                     PRODUCTIVITY SKILLS                         │
├─────────────────────────────────────────────────────────────────┤
│  [Recommended]  [Browse Library]  [Installed]                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  RECOMMENDED (from onyx-skills repo)                           │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ ★ docx         Create Word documents      [Enable]       │  │
│  │ ★ xlsx         Create Excel spreadsheets  [Enable]       │  │
│  │ ★ pptx         Create PowerPoint files    [Enable]       │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  BROWSE LIBRARY (from skills.sh)                               │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Search: [________________________]  Sort: [Popular ▼]    │  │
│  │                                                          │  │
│  │ vercel-react-best-practices    27.2K installs  [Add]    │  │
│  │ web-design-guidelines          20.4K installs  [Add]    │  │
│  │ remotion-best-practices         3.6K installs  [Add]    │  │
│  │ ...                                                      │  │
│  │                                                          │  │
│  │ [Load More]                                              │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Key Features

1. **Tabbed Interface**
   - "Recommended" - Curated skills from onyx-skills (current behavior)
   - "Browse Library" - Full skills.sh catalog
   - "Installed" - All currently installed skills

2. **Skills.sh Integration**
   - Fetch leaderboard data from skills.sh API
   - Show install counts and popularity
   - Search/filter functionality
   - Category filtering

3. **Installation Flow**
   - For onyx-skills: Current direct download behavior
   - For skills.sh: Use their repo structure (owner/repo/skill-name)

## Technical Implementation

### API Endpoints to Investigate

skills.sh appears to be a Next.js app. We need to find:
1. How they expose the leaderboard data (likely server-rendered or API)
2. How skills are structured in GitHub repos

### Data Model

```typescript
interface SkillsShSkill {
  id: string;              // e.g., "vercel-react-best-practices"
  owner: string;           // e.g., "vercel-labs"
  repo: string;            // e.g., "agent-skills"
  name: string;            // Display name
  installs: number;        // Install count
  weeklyInstalls?: number; // Weekly installs
}

interface OnyxSkill {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  files: string[];
  dependencies?: string[];
  isRecommended?: boolean; // From onyx-skills
  source: 'onyx' | 'skillssh';
}
```

### File Changes Required

1. **Settings.tsx**
   - Add tabs for Recommended/Browse/Installed
   - Add search input and filters
   - Add skills.sh browsing UI

2. **New: lib/skills.ts**
   - `fetchSkillsShLeaderboard()` - Get popular skills
   - `searchSkillsSh(query)` - Search skills
   - `installSkillFromGitHub(owner, repo, skillName)` - Install from any GitHub repo
   - Cache skills.sh data locally

3. **Rust Backend (lib.rs)**
   - Add command to clone/download from arbitrary GitHub repos
   - Support the skills.sh URL pattern: `https://raw.githubusercontent.com/{owner}/{repo}/main/skills/{skill-name}/SKILL.md`

### Skills.sh Data Fetching

Options to investigate:
1. **Scrape the leaderboard page** - Parse the HTML/JSON from skills.sh
2. **Check for API** - They might have a public API
3. **Use GitHub API** - Query popular skills repos directly

### UI/UX Considerations

1. **Loading States**
   - Show skeleton loaders while fetching skills.sh data
   - Cache results to avoid repeated fetches

2. **Error Handling**
   - Graceful fallback if skills.sh is unreachable
   - Clear error messages

3. **Install Feedback**
   - Show progress when downloading from GitHub
   - Confirm successful installation

## Implementation Phases

### Phase 1: Research & Infrastructure
- [ ] Determine how to fetch skills.sh data (API vs scraping)
- [ ] Create lib/skills.ts with data fetching logic
- [ ] Test with a few popular skills

### Phase 2: UI Implementation
- [ ] Add tab navigation to Productivity Skills section
- [ ] Implement Browse Library view with search
- [ ] Add install flow for skills.sh skills

### Phase 3: Polish
- [ ] Add caching for skills.sh data
- [ ] Add sorting (popular, trending, recent)
- [ ] Add category filtering
- [ ] Improve installed skills view

## Questions to Resolve

1. **How does skills.sh serve their data?**
   - Need to check if there's an API or if we need to scrape

2. **Skill file structure on skills.sh**
   - Are all skills structured the same way?
   - What's the path pattern for SKILL.md files?

3. **Compatibility**
   - Are all skills.sh skills compatible with OpenCode?
   - Should we filter to only show OpenCode-compatible skills?

## Next Steps

1. Investigate skills.sh data source
2. Create proof-of-concept for fetching skill list
3. Design the UI components
4. Implement incrementally
