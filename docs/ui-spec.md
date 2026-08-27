# UI Specification

This is a screen-by-screen implementation spec based on the design prototype (`design_handoff_node_networking_app/`).
Refer to `design-tokens.md` for color, typography, and spacing values.

## Screen Structure Overview

```
[Bottom Tab Navigator]
├── Home (HomeScreen)
├── List (ContactListScreen)
├── FAB → Scan (ScanStack)
│   ├── ScanCameraScreen
│   ├── ScanResultScreen
│   ├── CardRevealScreen
│   └── ManualInputScreen
├── Relationship Graph (GraphScreen)
└── Game (GameStack)
    ├── DeckBuilderScreen (Collection tab)
    └── BattleScreen (Battle tab)

[Stack Navigator (pushed on top of tabs)]
├── PersonDetailScreen (Person Detail)
├── ConversationRecordScreen (Conversation Recording)
└── CardDetailOverlay (Card Detail — modal)
```

---

## 1. Home (HomeScreen)

**feature folder**: `features/home/`

### Header
- Left: Logo — `shared/components/Logo.tsx` mark (26px, white ring + purple dot on transparent background) + "CARD:N" wordmark (Space Grotesk 700 17px)
- Right: Circular avatar with the user's initials

### Greeting
- "안녕하세요, {name}님" (Hello, {name}) (22px/700)
- "이번 주 새로운 인연 {n}명 · 전체 {n}명" ({n} new connections this week · {n} total) (13px, 45% white)

### My Business Card (Digital Business Card)
- Landscape card, aspect-ratio 1.72
- Background: `linear-gradient(125deg, #1c1c30, #12121e 55%, #171728)`
- Border: 1px primary 40%, radius 14px
- Bottom-right: decorative concentric-circle outline
- Top: mini logo + company name (11px/700, .1em tracking, 55%) | "DIGITAL CARD" (monospace 9px 30%)
- Middle: name (21px/800), title (12px/600, primaryLight)
- Bottom: phone + email (10.5px, 55%) | QR placeholder (44px)
- "수정" (Edit) button → inline edit mode: 4 input fields (name/company/title/contact), Surface-2 background
- Data persistence: local storage key `cardn-my-card`

### Recently Added
- Section label + "전체보기 ›" (View all ›) (→ List tab)
- 3 rows: avatar (role tint background + role color ring + initials) + name (14px/600) + "{role} · {title} · {company}" (12px, 45%) + relative time on the right (11px, 30%)
- Tap row → push to Person Detail

---

## 2. List (ContactListScreen)

**feature folder**: `features/contacts/`

### Header
- "전체 목록" (All Contacts) + "{n}명" ({n} people)

### Search
- Input: Surface-1, radius 11px, placeholder "이름, 회사, 태그로 검색" (Search by name, company, or tag)
- Filter targets: name, company, relation, job

### Category Chips
- "전체" (All) / "클라이언트" (Client) / "파트너" (Partner) / "네트워킹" (Networking) / "그 외" (Other)
- Single select. Active = Primary fill

### List Row
- 58×36px business card thumbnail (diagonal stripe pattern, role color border)
- Name + relation badge (role tint) + role/company + time
- Empty state: "검색 결과가 없어요" (No search results)

---

## 3. Scan (ScanStack)

**feature folder**: `features/scan/`

### 3-1. Camera (ScanCameraScreen)
- Title + single/batch segmented toggle (pill)
- Viewfinder: dark gradient panel, dashed cyan card guide (aspect 1.7)
- Hint text: single mode "명함을 프레임에 맞춰주세요" (Align the business card within the frame) / batch mode "연속으로 촬영하세요" (Take continuous shots)
- Animated cyan scan line (3s loop)
- Bottom: gallery button · shutter (66px primary circle) · "직접 입력" (Manual entry) (underlined text button)

### 3-2. Recognition Result (ScanResultScreen) — single mode
- "4개 항목 인식 · 1개 확인 필요" (4 fields recognized · 1 needs review) (cyan)
- Field card: label, editable value, confidence % on the right
  - ≥90%: green (#55E6C1)
  - <90%: yellow label "확인 필요" (Needs review) + yellow border
- Toggle: "전화번호부에도 저장" (Also save to phone contacts)
- "만난 컨텍스트" (Context of meeting) free-text input
- CTA "저장하고 카드 만들기" (Save and create card)

### 3-3. Card Reveal (CardRevealScreen)
- Battle card appears with a 500ms rotateY flip + purple glow
- Card content: stars (rarity), title, cost, avatar, name, team, class badge
- 4 stats (emoji + Space Grotesk), 2 skill chips
- Italic flavor text (LLM-generated)
- Buttons: "도감 보기" (View collection) / "완료" (Done)

### 3-4. Batch Mode
- Each shot adds a card to the horizontal tray at the bottom (viewfinder shows a "{n}장" ({n} cards) badge)
- Mini card: initials chip + name + role + status (Done / Needs review / Analyzing)
- CTA "{n}장 모두 저장" (Save all {n} cards) → List

### 3-5. Manual Entry (ManualInputScreen)
- "‹ 카메라로" (‹ Back to camera) back button
- "직접 입력" (Manual entry) + "명함 없이도 인물을 등록할 수 있어요" (You can register a contact even without a business card)
- 5 input fields: name/company/department & title/mobile phone/email
- Context-of-meeting input
- CTA "저장하고 카드 만들기" (Save and create card) → Card Reveal

---

## 4. Relationship Graph (GraphScreen)

**feature folder**: `features/graph/`

### Header
- "관계도" (Relationship Graph) + "1촌 {n}명 · 2촌 {n}명" ({n} 1st-degree · {n} 2nd-degree connections)
- Bell icon, top-right, with a badge showing the count of incoming introduction requests (`GET /graph/introduction-requests`). Hidden when the count is 0.

### Search & Filter
- Search input ("이름, 회사, 태그로 검색" — Search by name, company, or tag)
- Role filter chips: All/Development/Marketing/Design/Sales/HR/Finance
- When filtering, non-matching nodes and labels fade to 18% opacity (250ms)

### Graph (SVG or Canvas)
- Center: "나" (Me) node (24px radius, Primary fill, halo)
- 1st-degree: placed on 2 dashed concentric circles (r≈118/140), 15px radius
  - Surface-1 fill + role color ring 1.6px
  - 3s pulsing halo animation
  - Name label above, initials inside
- 2nd-degree: smaller nodes (10px radius), connected to their 1st-degree parent
  - **Privacy**: a 2nd-degree node only renders once that person has an *approved* introduction
    request through the connecting 1st-degree contact (see "Introduction Requests" below). Contacts
    without approval are not drawn at all — not grayed out, not counted in the header's 2촌 {n}.
- Edge: width = 0.6 + (conversation count × 0.35), cyan 35%

### Default Bottom Overlay
- "가장 가까운 사람" (Closest connections) + "전체 보기" (View all)
- Displays the top 2 people by conversation count as cards (name, "대화 {n}회 · {ago}" — {n} conversations · {ago})

### Tap Node → Bottom Sheet
- Surface-2, radius 18px (top), drag handle
- Avatar (rounded square) + name + company·role + "1촌"/"2촌" badge
- 3 stat tiles: Conversations {n} / Mutual connections {n} / Last conversation {ago} (yellow)
- "최근 대화 요약" (Recent conversation summary) card (latest timeline entry)
- Buttons (1촌 sheet): "프로필" (Profile) (→ Person Detail) + "공통 인맥 보기" (View mutual connections) (Primary)
- 1촌 sheet also shows a "내 프로필 소개 요청" (Request that this contact introduce me) row below the
  buttons:
  - Default state: text button, "이 사람의 인맥에게 내 프로필 소개 요청" → calls
    `POST /graph/{person_id}/introduction-requests`
  - `pending`: disabled, "소개 요청 보냄 · 승인 대기중"
  - `approved`: disabled, checkmark + "소개 승인됨 · 2촌에게 노출 중"
  - `declined`: text button re-enabled, "다시 요청하기"

### Introduction Requests Sheet (bell icon → sheet)
- Surface-2 sheet, title "소개 요청" ("Introduction requests")
- List of incoming requests: avatar, name, company·role, "{ago} 요청" ({ago} ago)
- Each row has "승인" (Approve, Primary) / "거절" (Decline, Surface-1) buttons →
  `POST /graph/introduction-requests/{person_id}/approve` / `.../decline`
- Approving immediately makes that person visible as a 2nd-degree node to the requester (not to me —
  I already know them as a 1st-degree contact); the sheet updates the row to a dismissible "승인됨" state
- Empty state: "받은 소개 요청이 없어요" (No introduction requests)

---

## 5. Person Detail (PersonDetailScreen)

**feature folder**: `features/contacts/`

### Header
- "‹ 뒤로" (‹ Back)
- Profile: 56px avatar + name (19px/800) + position·company + role badge + relation badge

### Contact Card
- 📞 / 📧 (cyan color)

### Battle Card Teaser
- Purple/coral gradient tint, stars, "배틀 카드 보기" (View battle card)
- "ATK n · DEF n · INT n · HP n" + chevron → Game > Collection

### Conversation History Timeline
- Vertical dots + connecting line + entry cards
- Card: date (11px, 40%), type badge, body text (13px, line-height 1.55)
- AI summary: purple dot/border, bold one-line summary + bullet list + "🎙 요약" (🎙 Summary) badge
- Delete button (red text)

### FAB "+"
- 54px, Primary, bottom-right
- Tap → dim overlay + action sheet (Surface-3):
  - "🎙 지금 녹음하기 — 대화를 실시간으로 녹음하고 요약" (🎙 Record now — record the conversation live and summarize it)
  - "📁 녹음 파일 업로드 — 기존 녹음 파일을 올려 요약 생성" (📁 Upload recording file — upload an existing recording to generate a summary)

### Introduction Request (cross-team: 그래프 기능과 연동)
PersonDetailScreen needs the same "소개 요청" action GraphScreen's 1st-degree bottom sheet has
(see §4's "Tap Node → Bottom Sheet" and `api-spec.md`'s "Introduction Requests"), so it's reachable
whether the person arrived here from the graph or from the contact list. Same 4 states as the graph
sheet's row: default ("이 사람의 인맥에게 내 프로필 소개 요청") / `pending` (disabled, "소개 요청 보냄 · 승인
대기중") / `approved` (disabled, "소개 승인됨 · 2촌에게 노출 중") / `declined` (re-enabled, "다시 요청하기").
Calls the same `POST /graph/{person_id}/introduction-requests` — no new API needed, this is a
`features/contacts/` UI addition only.

---

## 6. Conversation Recording (ConversationRecordScreen)

**feature folder**: `features/conversation/`

**Nothing leaves the device while recording.** The pipeline — upload, STT, summary — runs
once, on stop. Live keyword extraction was specced here originally and dropped on 2026-08-27:
it needs streaming STT, and the same keywords and to-dos already fall out of the summary two
phases later — so the extra machinery buys nothing the user will not see a few seconds later.

The screen is reached from either FAB action in §5, and leads with whichever one was tapped
(`mode: 'record' | 'upload'`, defaulting to `'record'`). The other entry stays available
below it — both land in the same flow from Phase 2 on.

### Phase 1: Recording
- "‹ 뒤로" (‹ Back), pulsing "● 녹음 중" (● Recording) pill (coral)
- Person's avatar/name/company
- Consent notice, shown before recording starts (see the privacy rule below)
- mm:ss timer (Space Grotesk 44px)
- 24-bar waveform animation (purple/cyan/lavender, staggered scaleY) — driven by the
  microphone's own metering, on-device only
- Stop button: 70px coral circle, square icon inside

### Phase 2: Upload + STT
- Spinner + phase label + elapsed seconds:
  - "녹음 파일 올리는 중…" (Uploading recording…) with a progress bar — hint: "파일은 변환이 끝나면 서버에서 바로 삭제돼요"
  - "음성 인식 중…" (Transcribing…) — hint: "녹음 길이만큼 걸려요. 처음 한 번은 모델을 내려받느라 더 느립니다"
- Takes as long as the recording is long. There is no fixed duration to design around.

### Phase 3: Transcript Review
- "인식된 텍스트" (Recognized text) — editable multiline field, with duration · model on the right
- Hint: "잘못 들린 부분을 고쳐두면 요약 품질이 올라가요. 특히 사람 이름."
- Collapsible "▸ 구간별 보기 ({n})" (View by segment) — timestamped STT segments
- "AI 요약 만들기" (Generate AI summary) button → Phase 4

This step is deliberate, not a placeholder for an automatic hand-off. Correcting one misheard
name before summarizing is the cheapest quality win in the whole feature — the name is what the
graph matches `mentioned_people` against, so a typo here costs a relationship edge.
While summarizing: "요약 생성 중…" — hint: "상대 정보와 지난 대화를 함께 넣어 정리하고 있어요"

### Phase 4: Summary Result
- Header: name + title, date · recording duration
- "✦ 한 줄 요약" (✦ One-line summary) card (purple tint, 14px/700)
- "핵심 내용" (Key points) — 3 bullets
- "할 일 1건" (1 to-do item) card (cyan tint, checkbox)
- Footnote: "녹음 원본은 저장되지 않아요 — 요약본만 기록에 저장됩니다" (The original recording is not saved — only the summary is saved to the record)
- Buttons: "삭제" (Delete) (1fr, coral outline) / "기록에 저장" (Save to record) (2fr, Primary)
  → On save, prepend to the person's timeline + persist, and push the conversation into the
    relationship graph (see `docs/features.md`'s conversation → graph touchpoint)
- After saving: "기록에 저장했어요" + "새 녹음 올리기" (Upload a new recording) to start over

**Privacy rule: the original audio is never persisted. Only the generated summary (one-liner + bullets + to-dos) is saved.**
A recording-consent notice is required (Korea's Protection of Communications Secrets Act).

---

## 7. Game — Collection/Deck Builder (DeckBuilderScreen)

**feature folder**: `features/game/`

### Header
- "명함 배틀" (Business Card Battle) + segmented pill ("배틀" (Battle) = coral fill / "도감" (Collection) = purple fill)

### My Deck Section
- "내 덱" (My Deck) + "{n} / 8" badge
- "보유 {n}장 · 도감 완성도 {pct}%" ({n} cards owned · {pct}% collection complete), right side: "평균 코스트 {x.x}" (Average cost {x.x})
- 4-column grid: selected cards = mini tiles (star 7px yellow, name 11px/800, "{atk} / {hp}" role color)
- Empty slot = dashed "+" tile

### Filter Chips
- "전체" (All) / "★4↑" / "개발" (Development) / "마케팅" (Marketing) / "영업" (Sales) / "미획득" (Not owned) (active = coral)

### Collection Grid
- 4 columns: owned cards (star/name/role/atk-hp; purple border + "✓" if in deck)
- Not owned: "🔒 미획득" (🔒 Not owned) locked tile
- Tap → Card Detail Overlay

### Card Detail Overlay
- Dim + blur, "✕" close
- Large card (250px, role color border + glow, flip-in animation)
- Stars + title / cost, rounded-square avatar, name, company, class badge
- ATK/DEF/INT/HP columns (coral/cyan/purple/mint)
- Skill chips + "패시브 · {class}" (Passive · {class}) chip
- Footer: "🗂 {date} 명함 등록 · 대화 {n}회" (🗂 Registered on {date} · {n} conversations)
- CTA: "덱에 넣기" (Add to deck) (coral) / "덱에서 빼기" (Remove from deck) (outline) / disabled "덱이 가득 찼어요" (Deck is full)

### Fixed Bottom CTA
- "🛡 배틀 시작" (🛡 Start Battle) (coral) → Battle screen

---

## 8. Game — Battle (BattleScreen)

**feature folder**: `features/game/`

See `game-rules.md` for detailed rules.

### Layout (top → bottom)
1. Enemy header (avatar, name, HP bar coral, hand/deck count, cost badge)
2. Enemy field (5 slots)
3. YOUR TURN pill + one-line log
4. Synergy badge (mint pill)
5. My field (5 slots)
6. Action bar (shown when a card is selected)
7. My header + cost pips (7, 14px bars, filled ones primaryLight)
8. Hand row + end-turn button

Background: subtle coral (top) / purple (bottom) radial gradient.

### Field Card (64px wide)
- Star, name, role, "ATK HP" (Space Grotesk)
- My card: role color border + glow (ready state), yellow border (selected)
- Status caption: "⚡ 탭하여 선택" (⚡ Tap to select) / "출근 중…" (Reporting for duty…) / "행동 완료" (Action complete) / "대상 선택!" (Select target!)
- Empty slot: dashed ("빈 자리" — Empty spot)

### Hand Card (70px)
- Role color top border, cost badge, name, role, atk/hp
- 38% opacity when cost is insufficient

### Result Overlay
- VICTORY (mint glow) / DEFEAT (coral glow)
- Space Grotesk 34px, subline, "다시 대전" (Battle again) button

---

## 9. Incoming Call Alert (System Notification)

**feature folder**: `features/call-alert/` (김민경), with the native half in
`modules/call-detector/`. See `docs/call-alert-spec.md`.

Android only. The notification is built and posted by the native receiver, not by JS —
at ring time the app's process is usually gone and the backend is often unreachable, so
nothing on that path may depend on either.

### Consent screen (CallAlertConsentScreen)
- Shown before the OS permission dialogs
- Title: "전화가 오면 누구인지 알려드릴까요?"
- Three reasons: 전화번호 확인 / 마지막 대화 요약 / 통신사 신호가 없어도 (explaining that
  the data is prefetched to the device, so no server call happens during the call)
- "알림 받기" (Primary) → requests `READ_PHONE_STATE` + `READ_CALL_LOG` +
  `POST_NOTIFICATIONS` together. All three are needed: without `READ_CALL_LOG`, Android
  9+ blanks the caller's number.
- Footnote states the permission requirement plainly rather than after the fact
- Once granted, the screen switches to a status card: "인맥 {n}명의 정보를 이 기기에
  저장해두었어요", with a warning line if the last refresh failed
- On iOS: "안드로이드에서만 사용할 수 있어요" and nothing else

### Notification (on incoming call, matched contact only)
- Title: `"{name}님에게 전화가 왔어요"`
- Body: last conversation's one-line summary, or `"아직 대화 기록이 없어요"` if the
  contact has no saved conversations (BigTextStyle, so a long summary is readable)
- Channel "수신 전화 알림", IMPORTANCE_HIGH
- One notification id per contact, so a second call replaces rather than stacks
- **No notification at all** for a number that doesn't match a saved contact, or for a
  withheld/unknown caller

### Tap behavior
- Deep link `cardn://person/{id}` → `PersonDetailScreen` (§5), same destination as
  tapping the contact from the list
- Navigation wiring for this route is still open — `src/navigation/` is shared ground
  and needs its own branch with 2+ approvals
