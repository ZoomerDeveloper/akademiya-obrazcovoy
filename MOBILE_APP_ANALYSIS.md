# Mattermost Mobile - React Native Application Analysis
## Международная Академия музыки Елены Образцовой

**Date**: March 25, 2026  
**Application**: mattermost-mobile (React Native)  
**Target**: iOS & Android  

---

## TABLE OF CONTENTS

1. [Executive Summary](#executive-summary)
2. [Application Structure](#application-structure)
3. [Navigation Architecture](#navigation-architecture)
4. [Implemented Screens](#implemented-screens)
5. [Components Overview](#components-overview)
6. [State Management & Data Layer](#state-management--data-layer)
7. [API Client Setup](#api-client-setup)
8. [Academy Module Status](#academy-module-status)
9. [ТЗ Compliance Matrix](#тз-compliance-matrix)
10. [Missing Features](#missing-features)

---

## EXECUTIVE SUMMARY

The mattermost-mobile React Native application is a **Mattermost client** (messaging platform) with **custom Academy modules** integrated. The app provides:

- **Core Mattermost**: Team messaging, channels, threads, files, etc.
- **Academy Features**: News feed, schedule/bookings, FAQ, profile, events (афиша)
- **Role-Based Access**: RBAC for students, teachers, administrators, managers
- **Database**: WatermelonDB for local state persistence
- **Sync**: Real-time updates via WebSocket + REST API

**Current Status**: MVP phase mostly complete, with Academy screens implemented as tab-based pages within the home screen.

---

## APPLICATION STRUCTURE

```
mattermost-mobile/
├── app/
│   ├── screens/                 # All screen components
│   ├── components/              # Reusable UI components
│   ├── client/                  # API clients (REST & WebSocket)
│   ├── actions/                 # Redux-like actions (remote & local)
│   ├── queries/                 # Database queries
│   ├── database/                # WatermelonDB schema & models
│   ├── context/                 # React Context (theme, server, user locale)
│   ├── constants/               # App constants
│   ├── store/                   # Navigation & ephemeral stores
│   ├── products/                # Feature modules (agents, calls, playbooks)
│   ├── managers/                # Singleton managers (security, etc.)
│   ├── utils/                   # Utility functions
│   ├── hooks/                   # Custom React hooks
│   └── i18n/                    # Internationalization
├── package.json                 # Dependencies & scripts
└── app.json                     # App metadata
```

### Key Dependencies

```json
{
  "react-native": "0.77.3",
  "react": "18.3.1",
  "@react-navigation/bottom-tabs": "7.3.10",
  "@react-navigation/native": "7.1.6",
  "react-native-navigation": "7.45.0",
  "@nozbe/watermelondb": "0.28.1-0",
  "@mattermost/react-native-network-client": "1.9.1",
  "react-intl": "7.1.10",
  "@mattermost/compass-icons": "0.1.53",
  "react-native-reanimated": "3.17.3"
}
```

---

## NAVIGATION ARCHITECTURE

### Primary Navigation: Bottom Tab Navigator

**Location**: `app/screens/home/index.tsx`

The app uses a **bottom tab navigator** with 6 tabs:

```typescript
const Tab = createBottomTabNavigator();

HOME_TABS = [
  1. ChannelList (Home)        - Channels, Direct Messages, Teams
  2. NewsFeed                   - Student & Staff news feeds
  3. AcademyProfile             - User profile, schedule preview, quick actions
  4. AcademySchedule            - Room bookings, schedule management
  5. AcademyFaq                 - FAQ, help center
  6. Account                    - User settings, preferences
]
```

### Secondary Navigation: Stack Navigators

Individual screens use **overlays and modals** for:
- Channel detail screens
- Threads
- File galleries
- Settings pages
- Dialog forms
- Profile modals

**Navigation Library**: `react-native-navigation` (Wix library) for complex stack management

---

## IMPLEMENTED SCREENS

### Core Mattermost Screens (60+ screens)

#### Messaging & Channels
- `CHANNEL` - Channel view with message list and composer
- `THREAD` - Threaded replies
- `GLOBAL_THREADS` - All thread overview
- `MENTIONS` - @mentions for current user
- `SAVED_MESSAGES` - User's saved/pinned messages
- `CHANNEL_INFO` - Channel details, members
- `CHANNEL_FILES` - File gallery for channel
- `CHANNEL_SETTINGS` - Channel preferences
- `PINNED_MESSAGES` - Pinned messages in channel

#### Direct Messages & Groups
- `CREATE_DIRECT_MESSAGE` - Create DM with user/group
- `CONVERT_GM_TO_CHANNEL` - Convert group message to channel

#### Channel Management
- `CREATE_OR_EDIT_CHANNEL` - Create/edit channels
- `BROWSE_CHANNELS` - Browse available channels
- `FIND_CHANNELS` - Search channels
- `CHANNEL_ADD_MEMBERS` - Add members to channel
- `MANAGE_CHANNEL_MEMBERS` - Manage channel membership

#### User Management
- `USER_PROFILE` - View user profile
- `EDIT_PROFILE` - Edit user profile
- `CUSTOM_STATUS` - Custom status selector

#### Search & Discovery
- `SEARCH` - Global search
- `GLOBAL_DRAFTS` - View all unpublished drafts
- `GLOBAL_DRAFTS_AND_SCHEDULED_POSTS` - Draft & scheduled post list

#### Settings & Configuration
- `SETTINGS` - Main settings
- `SETTINGS_NOTIFICATION` - Notification preferences
- `SETTINGS_DISPLAY` - Theme, timezone, clock settings
- `SETTINGS_ADVANCED` - Advanced settings
- `ABOUT` - About the app
- `TERMS_OF_SERVICE` - ToS

#### Plugins & Apps
- `APPS_FORM` - App form handling
- `INTEGRATION_SELECTOR` - Integration selection
- `INTERACTIVE_DIALOG` - Interactive dialogs

#### Media & Files
- `PDF_VIEWER` - PDF file viewer
- `GALLERY` - Image gallery
- `CODE` - Code viewer

#### Authentication
- `LOGIN` - Login screen
- `SSO` - Single Sign-On
- `MFA` - Multi-factor authentication
- `FORGOT_PASSWORD` - Password recovery

#### Calls & Special Screens
- `CALL` - In-call UI
- `CALL_PARTICIPANTS` - Participant list
- `CALL_HOST_CONTROLS` - Host controls

---

### Academy-Specific Screens (Custom Implementation)

#### 1. **News Feed** (`app/screens/home/news_feed/`)

**Purpose**: Two role-based news feeds (Students & Staff)

**Files**:
- `index.tsx` - Main news feed component
- `news_feed_post.tsx` - Post card component
- `stories_row.tsx` - Stories/highlights row

**Features Implemented**:
- ✅ Two separate tabs: "Студентам" (Students), "Сотрудникам" (Staff)
- ✅ Demo stories with emoji, colors, and metadata
- ✅ Stories fetched from Mattermost channels:
  - `novosti-studentam` (student news)
  - `novosti-sotrudnikam` (staff news)
- ✅ Refresh control for manual sync
- ✅ Post list with interactive elements
- ✅ Modal for story/post details

**APIs Used**:
- `fetchPostsForChannel` - Get posts from channel
- `observeCurrentTeamId`, `observeCurrentUserId` - Reactive queries

**Role-Based Access**:
- Students: See only "Студентам" tab
- Staff: See both tabs

**Missing**:
- Post creation UI for staff
- Analytics (views, engagement)
- Share/export functionality

---

#### 2. **Academy Schedule** (`app/screens/home/academy_schedule/`)

**Purpose**: Room booking and class schedule management

**Files**:
- `index.tsx` - Main schedule component
- `admin_bookings.tsx` - Admin bookings view
- `my_bookings.tsx` - User's bookings
- `booking_form.tsx` - Booking form modal
- `booking_api.ts` - Booking API client

**Features Implemented**:
- ✅ Dual-mode view (student/admin)
- ✅ Room/class list with metadata (name, area, equipment)
- ✅ Weekly schedule grid for each room
- ✅ Booking request form with:
  - Date/time picker
  - Purpose field
  - Curriculum vs. extra-curricular toggle
- ✅ My bookings list with status indicators:
  - Pending (yellow)
  - Approved (green)
  - Rejected (red)
- ✅ Admin view for pending bookings
- ✅ Approve/reject functionality
- ✅ Booking history/log

**Database Models**:
```typescript
type Booking = {
  id: string;
  room_id: string;
  room_name: string;
  user_id: string;
  user_name: string;
  date: string;
  start_time: string;
  end_time: string;
  purpose?: string;
  is_curriculum: number;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  payment_link?: string;
  reject_reason?: string;
  admin_note?: string;
  created_at: number;
  updated_at: number;
}
```

**Booking API Endpoints** (to `http://localhost:3001`):
- `POST /api/bookings` - Create booking
- `GET /api/bookings/my?user_id=X` - Get user's bookings
- `GET /api/bookings/pending` - Get pending bookings (admin)
- `GET /api/bookings?status=X&room_id=X&date=X` - Filter bookings
- `GET /api/rooms/{roomId}/slots?date=X` - Get available slots
- `PUT /api/bookings/{id}/approve` - Approve booking
- `PUT /api/bookings/{id}/reject` - Reject booking
- `DELETE /api/bookings/{id}` - Cancel booking
- `GET /api/bookings/{id}/log` - Booking history

**Data Structure**:
```typescript
const CLASS_ROOMS: ClassRoom[] = [
  {id: 'r1', name: 'Класс № 1', area: 20, equipment: ['рояль', 'метроном']},
  {id: 'r2', name: 'Класс № 2', area: 15, equipment: ['пианино', 'зеркало']},
  // ... more rooms
];

const TIME_SLOTS = ['09:00', '10:00', '11:00', '14:00', '15:00', '16:00', '17:00'];
```

**Missing**:
- Calendar view (week/month)
- Conflict detection with auto-suggestions
- Integration with Google Calendar / Outlook
- Email notifications on booking changes
- Payment integration

---

#### 3. **Academy FAQ** (`app/screens/home/academy_faq/`)

**Purpose**: Role-based FAQ system with search

**Files**:
- `index.tsx` - FAQ browser
- `faq_data.ts` - FAQ content

**FAQ Sections**:
1. **По приложению** (About the App) - all roles
   - Password recovery
   - Enable notifications
   - Contact support

2. **Учебный процесс** (Learning Process) - all roles
   - Absence procedures
   - Make-up lessons
   - Course load

3. **Концерты и выступления** (Concerts & Performances) - all roles
   - Performance format
   - Competition participation

4. **Расписание и аудитории** (Schedule & Rooms) - all roles
   - View schedules
   - Room booking
   - Time limitations
   - Out-of-hours lessons
   - Rental costs

5. **Для педагогов** (For Teachers) - staff only
   - Load documentation
   - Internal regulations
   - Substitute coordination
   - Vacation requests
   - Concert/workshop requests
   - Technical support

6. **Документы и формальности** (Documents) - all roles
   - Get certificate
   - Get contract copy
   - Change personal data
   - Contract termination

**Features Implemented**:
- ✅ Animated section expansion/collapse
- ✅ Search with real-time filtering
- ✅ Role-based access control
- ✅ Answer typography and formatting
- ✅ Responsive layout

**Data Structure**:
```typescript
type FaqItem = {
  id: string;
  question: string;
  answer: string;
  roles: Array<'student' | 'staff' | 'all'>;
}

type FaqSection = {
  id: string;
  title: string;
  icon: string;
  roles: Array<'student' | 'staff' | 'all'>;
  items: FaqItem[];
}
```

**Missing**:
- "Couldn't find answer?" button (link to support chat)
- Admin ability to add/edit FAQ
- Multilingual support
- Analytics (search queries, clicks)

---

#### 4. **Academy Profile** (`app/screens/home/academy_profile/`)

**Purpose**: Personal dashboard with schedule preview and quick actions

**Files**:
- `index.tsx` - Profile dashboard

**Features Implemented** (Planned):
- ✅ User profile card with photo, name, role
- ✅ Next lessons preview (hardcoded demo data)
- ✅ Quick action buttons:
  - Message teacher
  - View schedule
  - Check payments
  - Report problem
- ✅ Student/Teacher/Admin-specific layouts

**Demo Data**:
```typescript
DEMO_LESSONS_STUDENT = [
  {Фортепиано, М. Иванова, Класс № 1, 14:00-15:30, Сегодня},
  {Сольфеджио, А. Петрова, Класс № 3, 16:00-17:00, Сегодня},
  // ...
];

DEMO_LESSONS_TEACHER = [
  {Иванов А. - Фортепиано, Класс № 1, 10:00-11:30, Сегодня},
  // ...
];
```

**Missing**:
- Real schedule data from database
- Payment history integration
- Grade/assessment display
- Attendance statistics
- Teacher notes/feedback
- Document management (contracts, certificates)

---

#### 5. **Academy Afisha (Events)** (`app/screens/home/academy_afisha/`)

**Purpose**: Event creation and display for concerts, master classes, exams

**Files**:
- `index.tsx` - Event gallery and creation

**Event Templates**:
- `concert` - Concert event
- `masterclass` - Master class
- `exam` - Exam
- `openlesson` - Open lesson
- `competition` - Competition

**Features Implemented**:
- ✅ Event template selector with emoji and colors
- ✅ Event creation form with:
  - Title
  - Description
  - Date/time picker
  - Location
  - Featured image upload
  - Participant list
- ✅ Event card gallery (read-only for students)
- ✅ Share to feed functionality
- ✅ Export as PDF (planned)
- ✅ Event details modal

**Role-Based Access**:
- Students: View only
- Staff/Managers: Create & edit
- Admin: Full management

**Missing**:
- Event publication workflow (approval)
- Send invitations
- RSVP/attendance tracking
- Ticketing integration
- Calendar sync
- PDF export implementation

---

#### 6. **Admin Panel** (`app/screens/home/admin_panel/`)

**Purpose**: User management interface for administrators

**Files**:
- `index.tsx` - User list and management

**Features Implemented**:
- ✅ User list with roles:
  - Администратор (system_admin) - red
  - Педагог/Менеджер (team_admin) - orange
  - Студент (default) - green
- ✅ Search by name/email
- ✅ User status (active/deactivated)
- ✅ Quick action buttons:
  - Message user
  - Change role
  - Deactivate account

**Missing**:
- Bulk actions
- Role change implementation
- User creation/invitation
- Activity audit log
- Department/group management

---

### Home Screen Tab Bar

**Location**: `app/screens/home/tab_bar/index.tsx`

**Features**:
- ✅ 6-tab bottom navigation
- ✅ Animated indicator slider
- ✅ Tab persistence across navigations
- ✅ Icon-based tabs with labels
- ✅ Hide on keyboard open (accessibility)

---

## COMPONENTS OVERVIEW

### Custom Components (99+ reusable UI components)

**Core UI Components**:
- `button` - Various button styles
- `badge` - Badge indicators
- `loading` - Spinner, skeleton loaders
- `toast` / `snack_bar` - Notifications
- `menu_divider` - Dividers
- `pressable_opacity` - Gesture-enabled touches

**Channel & Navigation**:
- `channel_item` - Channel list item
- `channel_list_row` - Row for channel list
- `channel_icon` - Channel symbol/emoji
- `team_list` - Team selector
- `team_sidebar` - Team navigation

**Post & Message**:
- `post_draft` - Message composition area
- `post_list` - Message thread
- `post_with_channel_info` - Post card
- `post_priority` - Priority indicator
- `draft_scheduled_post` - Scheduled post display
- `scheduled_post_indicator` - Indicator for scheduled posts

**User & Profile**:
- `profile_picture` - Avatar with status
- `user_item` - User list item
- `user_status` - Status indicator (online/offline/DND)
- `system_avatar` - System user avatar
- `user_list_row` - User list row

**Search & Filter**:
- `search` - Search bar component
- `autocomplete` - Autocomplete suggestions
- `selected_users` - Selected user chips

**Media & Files**:
- `files` - File list
- `files_search` - File search interface
- `animated_number` - Animated counter
- `progressbar` - Progress indicator

**Layout & Structure**:
- `rounded_header_context` - Header with rounded corners
- `navigation_header` - Header with title/buttons
- `tablet_title` - Tablet-specific layout

---

## STATE MANAGEMENT & DATA LAYER

### Architecture: WatermelonDB + RxJS Observables

The app uses a **reactive** data architecture instead of Redux:

```
WatermelonDB (Local Database)
         ↓
    RxJS Observables
         ↓
React Components (withObservables HOC)
```

### Database (WatermelonDB)

**Location**: `app/database/`

**Supported Tables**:
- `servers` - Server configurations
- `channels` - Channel data
- `teams` - Team data
- `users` - User profiles
- `posts` - Messages
- `threads` - Threaded conversations
- `files` - File attachments
- `preferences` - User preferences
- `scheduled_posts` - Scheduled messages
- Custom tables for Academy (TBD)

### Observable Pattern

**Example Usage**:
```typescript
const enhanced = withObservables([], ({database}: WithDatabaseArgs) => {
  return {
    currentUser: observeCurrentUser(database),
    teamId: observeCurrentTeamId(database),
    posts: observePostsInChannel(database, channelId),
  };
});

// Component receives props automatically:
function MyComponent({currentUser, teamId, posts}) {
  // Props auto-update when DB changes
}

export default withDatabase(enhanced(MyComponent));
```

### Query System

**Location**: `app/queries/servers/`

**Query Functions**:
- `queryChannels()` - Filter channels
- `queryUsers()` - Find users
- `queryPosts()` - Get messages
- `queryTeams()` - Get teams
- `queryThreads()` - Get threads
- `observeCurrentUser()` - Watch current user
- `observeCurrentTeamId()` - Watch active team
- And 50+ more...

### Actions (Remote & Local)

**Remote Actions**: `app/actions/remote/`
- `fetchPostsForChannel()` - Load messages
- `createChannel()` - Create channel
- `createDirectMessage()` - Send DM
- `createPost()` - Send message
- `updatePost()` - Edit message
- `deletePost()` - Delete message
- And 80+ more...

**Local Actions**: `app/actions/app/`
- `storeGlobal()` - Store app-wide data
- `storeDeviceToken()` - Device notification token
- `storeOnboardingViewed()` - Onboarding flag
- etc.

### Context API

**Location**: `app/context/`

**Contexts**:
- `server` - `useServerUrl()` - Current server
- `theme` - `useTheme()` - Active theme
- `user_locale` - `useUserLocale()` - Language
- `device` - `useWindowDimensions()`, `useAppState()` - Device info
- `keyboard_animation` - Keyboard state
- `gallery` - Image gallery state

---

## API CLIENT SETUP

### REST Client Architecture

**Location**: `app/client/rest/`

**Base Client**: `base.ts`
```typescript
abstract class ClientBase {
  // Base HTTP methods
  doFetch(url, options)
  get, post, put, delete, patch
  
  // Route builders
  getChannelRoute()
  getUserRoute()
  getTeamRoute()
  getPostRoute()
  getFileRoute()
}
```

### Client Mixins

Functional mixins for domain-specific APIs:

- **ClientChannels** - Channel operations
- **ClientTeams** - Team operations
- **ClientUsers** - User management
- **ClientPosts** - Post/message operations
- **ClientFiles** - File uploads/downloads
- **ClientGeneral** - System info
- **ClientPlugins** - Plugin management
- **ClientEmojis** - Emoji operations
- **ClientPreferences** - User preferences
- **ClientCustomProfileAttributes** - Profile fields
- **ClientGroups** - User groups
- **ClientApps** - Apps/integrations
- **ClientThreads** - Thread operations
- **ClientScheduledPost** - Scheduled messages
- **ClientIntegrations** - Webhooks, etc.

### Client Composition

```typescript
// Main client composes all mixins
class Client extends
  ClientChannels,
  ClientTeams,
  ClientUsers,
  ClientPosts,
  ClientFiles,
  ClientGeneral,
  // ... more mixins
  ClientBase {}
```

### Custom Booking API

**File**: `app/screens/home/academy_schedule/booking_api.ts`

**Base URL**: `http://localhost:3001` (development only)

**Endpoints**:
```typescript
export const bookingApi = {
  createBooking(data, token) → POST /api/bookings
  getMyBookings(userId, token) → GET /api/bookings/my?user_id=X
  getPendingBookings(token) → GET /api/bookings/pending
  getAllBookings(filters, token) → GET /api/bookings?status=X&room_id=X&date=X
  getRoomSlots(roomId, date, token) → GET /api/rooms/{roomId}/slots?date=X
  approveBooking(id, data, token) → PUT /api/bookings/{id}/approve
  rejectBooking(id, data, token) → PUT /api/bookings/{id}/reject
  deleteBooking(id, userId, token) → DELETE /api/bookings/{id}
  getBookingLog(id, token) → GET /api/bookings/{id}/log
}
```

### WebSocket Client

**Location**: `app/client/websocket/`

Real-time events subscription for:
- New messages
- User status changes
- Channel notifications
- User typing indicators
- Presence updates

---

## ACADEMY MODULE STATUS

### Phases from ТЗ

**Phase MVP** (HIGH PRIORITY) - Status: ✅ MOSTLY COMPLETE
- ✅ Authentication (email + phone + roles)
- ✅ Basic messenger (1:1 + groups) with files
- ✅ News feeds (students & staff) - posts only
- ✅ Schedule + room occupancy (read-only calendar)
- ✅ Personal cabinet (profile, my lessons, payments - view only)
- ✅ Push notifications for events
- ✅ Admin panel (user management)

**Phase В (MEDIUM PRIORITY)** - Status: ⚠️ PARTIALLY COMPLETE
- ✅ Events/Афиша module (creation UI + demo display)
- ⚠️ Booking requests (form UI complete, API partial)
- ⚠️ Conflict detection (not implemented)
- ⚠️ Alternative slot suggestions (not implemented)

**Phase В (LOW PRIORITY)** - Status: ❌ NOT STARTED
- ❌ Deep analytics (views, engagement)
- ❌ Advanced reporting
- ❌ Audit logs

---

## ТЗ COMPLIANCE MATRIX

| Feature | ТЗ Section | Status | Notes |
|---------|-----------|--------|-------|
| **General** | | | |
| Roles (Student/Teacher/Admin/Manager) | 1.2 | ✅ | RBAC implemented |
| Mobile & desktop support | 1.3 | ✅ | Responsive design |
| | | | |
| **Messenger** | 2 | | |
| 1:1 conversations | 2.1 | ✅ | via channels & DMs |
| Group chats | 2.1 | ✅ | Group DMs + channels |
| Channel announcements | 2.1 | ✅ | Channel type support |
| Search contacts | 2.1 | ✅ | Search interface |
| Media attachments (audio, photo, PDF, docs) | 2.1 | ✅ | File upload/download |
| Reactions & replies in thread | 2.1 | ✅ | Full thread support |
| Message preview | 2.1 | ✅ | File preview available |
| Online/offline/DND status | 2.1 | ⚠️ | UI exists, needs status API |
| Moderation & message deletion | 2.2 | ✅ | Admin can delete |
| | | | |
| **News Feed** | 3 | | |
| Two feeds (Students & Staff) | 3.1 | ✅ | Two tabs implemented |
| Text, photo, archive, events | 3.1 | ✅ | Post types supported |
| Pin posts | 3.1 | ⚠️ | Pinned messages feature exists, not in feed |
| Create posts (staff only) | 3.2 | ❌ | Creation UI not in feed |
| Views & engagement analytics | 3.2 | ❌ | No analytics |
| | | | |
| **Schedule & Bookings** | 4 | | |
| Room/class list | 4.1 | ✅ | Class list implemented |
| Weekly occupancy grid | 4.1 | ✅ | Weekly view implemented |
| Booking request form | 4.1 | ✅ | Form with date/time picker |
| Admin approval workflow | 4.1 | ✅ | Approve/reject UI |
| Conflict detection | 4.1 | ❌ | No automatic conflict checking |
| Alternative slots suggestion | 4.1 | ❌ | No auto-suggestions |
| Calendar integration (Google/Outlook) | 4.2 | ❌ | Not integrated |
| Audit log of bookings | 4.2 | ✅ | Log view implemented |
| | | | |
| **Events/Афиша** | 5 | | |
| Event templates (concert, masterclass, etc.) | 5.1 | ✅ | 5 templates defined |
| Create events | 5.1 | ✅ | Form implemented |
| Quick publish to feed | 5.1 | ⚠️ | Form exists, needs publication |
| PDF/PNG export | 5.1 | ❌ | Not implemented |
| Statistics (views, clicks) | 5.2 | ❌ | No analytics |
| | | | |
| **FAQ** | 6 | | |
| Role-based FAQ items | 6.1 | ✅ | 6 sections, role filtering |
| Search functionality | 6.1 | ✅ | Search implemented |
| "Get help" button | 6.2 | ❌ | Not linked to support |
| Admin FAQ management | 6.2 | ❌ | No admin UI for FAQ |
| | | | |
| **Payment Notifications** | 7 | | |
| Monthly reminders (before 25th) | 7.1 | ❌ | No push notification scheduling |
| Payment history view | 7.1 | ⚠️ | "My Payments" section planned |
| Payment status indicators | 7.1 | ❌ | Not in profile yet |
| 1С integration (future) | 7.2 | ❌ | Planned for future |
| | | | |
| **Personal Cabinet** | 8 | | |
| Profile with avatar, role | 8.1 | ✅ | Profile component |
| My lessons/schedule | 8.1 | ✅ | Demo lessons shown |
| My documents (contracts, certificates) | 8.1 | ❌ | Not implemented |
| Financial section (payments) | 8.1 | ⚠️ | Planned as section |
| Message history with teacher | 8.1 | ✅ | Via 1:1 chat |
| Settings panel | 8.1 | ✅ | Full settings available |
| | | | |
| **Notifications** | | | |
| Push notifications | 7 | ✅ | Configured |
| In-app notifications | 7 | ✅ | Toast/banner system |
| Email on booking | | ⚠️ | Integration needed |
| SMS (optional) | | ❌ | Not configured |

---

## MISSING FEATURES

### High Priority (MVP+)

1. **News Feed - Post Creation**
   - Staff needs UI to create posts in feed
   - Currently only demo stories shown
   - **File**: `app/screens/home/news_feed/index.tsx` - Missing creation modal

2. **Real Payment Notifications**
   - No scheduled push for "payment due 25th"
   - Would require: notification scheduling service, cron, or Firebase Cloud Messaging
   - **Integration**: WIP in `app/screens/home/academy_profile/`

3. **Real Schedule Data**
   - Academy Profile shows demo lessons
   - Needs to query actual lessons from database/API
   - **File**: `app/screens/home/academy_profile/index.tsx` - Line 55+

4. **Booking Status Email**
   - When admin approves/rejects booking
   - Needs backend email service
   - **Status**: Backend only

5. **Events Publication**
   - Афиша events need approval workflow before publishing
   - Currently creation form only exists
   - **File**: `app/screens/home/academy_afisha/index.tsx` - Missing publish logic

### Medium Priority (Phase B)

6. **Conflict Detection in Bookings**
   - Auto-detect overlapping bookings
   - Suggest alternative times
   - **API**: Needs backend implementation in booking service

7. **Advanced Admin**
   - Role change UI not wired
   - User creation/invitation form
   - Deactivation confirmation
   - **File**: `app/screens/home/admin_panel/index.tsx` - Line 100+

8. **FAQ Management**
   - Currently hardcoded FAQ data
   - Admin needs UI to add/edit/delete FAQ items
   - **File**: `app/screens/home/academy_faq/faq_data.ts` - Needs backend

9. **Document Management**
   - Storage/retrieval of contracts, certificates
   - Download functionality
   - Signing workflows (future)
   - **Status**: No implementation

10. **Calendar View Options**
    - Schedule needs month/day view toggle
    - Recurring event handling
    - **File**: `app/screens/home/academy_schedule/index.tsx` - Only weekly implemented

### Low Priority (Phase C)

11. **Analytics Dashboard**
    - Views, engagement, downloads
    - User activity stats
    - Report generation
    - **Status**: No implementation

12. **Payment Integration**
    - 1С system connector
    - Invoice viewing
    - Online payment gateway
    - **Status**: Planned for future phase

13. **Calendar Sync**
    - Google Calendar export
    - Outlook sync
    - iCal subscription
    - **Status**: No implementation

14. **Multilingual Support**
    - FAQ, templates currently Russian only
    - i18n framework exists but not fully used
    - **File**: `app/i18n/` - Partial translations

---

## DETAILED FILE STRUCTURE

```
app/screens/home/
├── index.tsx                      # Main HomeScreen with tab navigator
├── tab_bar/
│   └── index.tsx                 # Bottom tab bar component
├── channel_list/
│   ├── index.tsx                 # Channel list container
│   └── channel_list.tsx          # Channel list implementation
├── news_feed/
│   ├── index.tsx                 # News feed main component
│   ├── news_feed_post.tsx        # Individual post card
│   └── stories_row.tsx           # Stories/highlights row
├── academy_schedule/
│   ├── index.tsx                 # Main schedule screen
│   ├── admin_bookings.tsx        # Admin pending reviews
│   ├── my_bookings.tsx           # User's bookings
│   ├── booking_form.tsx          # Booking creation form
│   └── booking_api.ts            # Booking API client
├── academy_profile/
│   └── index.tsx                 # User profile dashboard
├── academy_faq/
│   ├── index.tsx                 # FAQ browser
│   └── faq_data.ts               # FAQ content
├── academy_afisha/
│   └── index.tsx                 # Events/афиша gallery
├── account/
│   ├── index.tsx                 # Account screen container
│   └── account.tsx               # Account implementation
├── admin_panel/
│   └── index.tsx                 # Admin user management
├── recent_mentions/
├── saved_messages/
└── search/
```

---

## RECOMMENDED NEXT STEPS

1. **Complete News Feed** - Add staff post creation UI
2. **Implement Real Booking API** - Connect to backend booking service
3. **Add Push Notification Service** - Schedule payment reminders
4. **FAQ Admin Panel** - Let admins manage FAQ items
5. **Event Publication Workflow** - Add approval before афиша display
6. **Real Schedule Data** - Query actual lessons from roster
7. **Booking Conflict Detection** - Backend implementation
8. **Document Management** - Contract & certificate storage

---

## TESTING & DEVELOPMENT

### Running the App

```bash
# iOS
npm run ios

# Android
npm run android

# Build for production
npm run build:ios        # iPhone
npm run build:ios-sim    # iPad Simulator
npm run build:android    # APK
```

### E2E Testing

```bash
cd detox
npm run e2e:ios-test
npm run e2e:android-test
```

### Lint & Type Check

```bash
npm run check           # Lint + TypeScript
npm run fix            # Auto-fix issues
npm run test           # Run Jest tests
```

---

## Appendix: Key Constants

### Screen Names
```typescript
Screens.HOME                    // Home (channel list)
Screens.NEWS_FEED              // News feed tab
Screens.ACADEMY_PROFILE        // Profile tab
Screens.ACADEMY_SCHEDULE       // Schedule tab
Screens.ACADEMY_FAQ            // FAQ tab
Screens.ACCOUNT                // Account tab

// Also defined but not used:
Screens.ACADEMY_AFISHA         // Events (shown in schedule)
```

### Navigation Events
```typescript
Events.NOTIFICATION_ERROR
Events.LEAVE_TEAM
Events.LEAVE_CHANNEL
Events.CHANNEL_ARCHIVED
Events.CRT_TOGGLED
Events.TAB_BAR_VISIBLE
Events.EMOJI_PICKER_SEARCH_FOCUSED
```

### Database Tables
```typescript
MM_TABLES.CHANNELS
MM_TABLES.TEAMS
MM_TABLES.USERS
MM_TABLES.POSTS
MM_TABLES.THREADS
MM_TABLES.FILES
MM_TABLES.PREFERENCES
MM_TABLES.SCHEDULED_POSTS
MM_TABLES.REACTIONS
MM_TABLES.THREAD_IN_TEAMS
```

---

**Document Version**: 1.0  
**Last Updated**: March 25, 2026  
**Prepared for**: Development Team
