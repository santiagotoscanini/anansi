# Goals Management Application

A comprehensive personal goals management and tracking system with visual goal hierarchies, relationship mapping, and weekly progress retrospectives.

## Main Goal of the Application

- **Personal Goals Management**: Create, organize, and track hierarchical goals with visual positioning
- **Visual Goal Relationships**: Map weighted connections between goals to understand dependencies and importance
- **Weekly Progress Tracking**: Conduct weekly retrospectives with file attachments and progress documentation
- **Values-Based Goal Setting**: Align goals with personal values using color-coded value associations

## Technologies

### Frontend

- **Next.js 14**: React framework with app directory structure
- **React 18**: UI component library with modern hooks
- **TypeScript**: Type-safe development
- **Tailwind CSS**: Utility-first CSS framework
- **React Flow (@xyflow/react)**: Interactive graph visualization for goal networks
- **Framer Motion**: Animations and transitions
- **Lucide React**: Icon library

### Backend

- **tRPC**: End-to-end typesafe APIs
- **Next.js API Routes**: Server-side API handling
- **Jose**: JWT token handling for authentication
- **Zod**: Runtime type validation and schema definition

### Database

- **PostgreSQL**: Primary database
- **Drizzle ORM**: Type-safe database operations
- **Drizzle Kit**: Database migrations and management

### State Management

- **React Context**: Global state management
- **TanStack React Query**: Server state management via tRPC
- **IDB Keyval**: Client-side storage

### Development Tools

- **ESLint**: Code linting
- **Prettier**: Code formatting
- **TypeScript**: Static type checking

## Project Structure

```
src/
     app/                          # Next.js app directory
         api/trpc/[trpc]/         # tRPC API endpoints
         uploads/[...path]/       # File serving route
         layout.tsx               # Root layout
         page.tsx                 # Main application page
     components/goals/             # Goal-related React components
         GoalsDashboard.tsx       # Main dashboard with tabs
         GoalsGraph.tsx           # Interactive goal network visualization
         GoalNode.tsx             # Individual goal node component
         GoalModal.tsx            # Goal creation/editing modal
         EditableEdge.tsx         # Connection weight editor
         ValuesManager.tsx        # Values management interface
         WeeklyRetrospective.tsx  # Weekly sync interface
         LifeProgress.tsx         # Progress tracking dashboard
         FileSelectionModal.tsx   # File upload interface
     contexts/
        GoalsContext.tsx         # Global state management
     lib/
         api/                     # tRPC configuration and routers
         routers/
             auth.ts          # Authentication router
             goals.ts         # Goals management router
         root.ts              # Root tRPC router
         trpc.ts              # tRPC configuration
         types.ts             # Shared types and schemas
         data/
             schema.ts            # Drizzle database schema
             index.ts             # Database connection
         auth-client.ts           # Client-side auth utilities
         auth-server.ts           # Server-side auth utilities
         image-upload.ts          # File upload utilities
     trpc/
         react.tsx                # tRPC React configuration
     styles/                      # Global styles

uploads/                         # File storage directory (not in src/)
     {userId}_{sanitizedUserName}/
         weekly-sync/
             {goalId}/
                 {trackingItemId}/
                     images/
                     documents/
```

## Features

### Core Goal Management

- **Hierarchical Goals**: Create parent-child goal relationships
- **Visual Positioning**: Drag-and-drop goal positioning on interactive canvas
- **Goal CRUD Operations**: Full create, read, update, delete functionality
- **Goal Descriptions**: Rich text descriptions for detailed goal documentation

### Values System

- **Personal Values**: Define core personal values with custom colors
- **Value-Goal Association**: Link goals to relevant personal values
- **Color Coding**: Visual representation through color-coded value systems

### Task Management

- **Difficulty-Based Tasks**: Assign difficulty levels (1-3) to goal-specific tasks
- **Task Completion Tracking**: Mark tasks as completed for progress monitoring
- **Task CRUD Operations**: Full task management within goals

### Goal Connections

- **Weighted Relationships**: Create connections between goals with importance weights (0-100)
- **Importance Calculation**: Automatic goal importance based on outgoing connection weights
- **Visual Connection Editing**: Interactive edge editing for connection weights

### Visual Graph Interface

- **Interactive Network**: React Flow-based goal network visualization
- **Drag-and-Drop**: Repositionable goals and connections
- **Zoom and Pan**: Navigate large goal networks
- **Real-time Updates**: Live updates when goals or connections change

### Weekly Retrospectives

- **Progress Tracking Items**: Define items to track for weekly reviews
- **File Attachments**: Upload images, documents, and text files for each tracking item
- **Weekly Sync Sessions**: Create weekly retrospective sessions
- **Historical Tracking**: Maintain history of weekly progress

### Life Progress Dashboard

- **Progress Analytics**: Visual representation of goal and task completion
- **Trend Analysis**: Track progress over time
- **Achievement Metrics**: Statistics on completed goals and tasks

### Multi-User Support

- **User Selection**: Choose from available users at login
- **User Isolation**: Complete data separation between users
- **Custom Authentication**: Password-based user authentication

### File Management

- **Image Uploads**: Support for various image formats (PNG, JPG, JPEG, GIF, WebP)
- **Document Uploads**: Text files, PDFs, and other document types
- **Text Editor**: Built-in text editing for note-taking
- **File Organization**: Structured file storage by user, goal, and tracking item

## Database Structure and Relations

### Core Tables

#### users

- `id` (text, primary key): Unique user identifier
- `name` (text): User display name
- `createdAt`, `updatedAt` (timestamp): Audit timestamps

#### values

- `id` (text, primary key): Unique value identifier
- `name` (text): Value name
- `color` (text): Color code for visual representation
- `userId` (text, foreign key): References users.id
- `createdAt`, `updatedAt` (timestamp): Audit timestamps

#### goals

- `id` (text, primary key): Unique goal identifier
- `title` (text): Goal title
- `description` (text): Detailed goal description
- `parentId` (text, nullable): References goals.id for hierarchy
- `positionX`, `positionY` (real): Canvas position coordinates
- `userId` (text, foreign key): References users.id
- `createdAt`, `updatedAt` (timestamp): Audit timestamps

#### tasks

- `id` (text, primary key): Unique task identifier
- `goalId` (text, foreign key): References goals.id
- `title` (text): Task title
- `difficulty` (integer): Difficulty level (1, 2, or 3)
- `completed` (boolean): Completion status
- `createdAt`, `updatedAt` (timestamp): Audit timestamps

#### connections

- `id` (text, primary key): Unique connection identifier
- `source` (text, foreign key): References goals.id (source goal)
- `target` (text, foreign key): References goals.id (target goal)
- `weight` (real): Connection importance weight (0-100)
- `createdAt`, `updatedAt` (timestamp): Audit timestamps

#### trackingItems

- `id` (text, primary key): Unique tracking item identifier
- `goalId` (text, foreign key): References goals.id
- `title` (text): Tracking item title
- `description` (text, nullable): Optional description
- `order` (integer): Display order
- `deletedAt` (timestamp, nullable): Soft delete timestamp
- `createdAt`, `updatedAt` (timestamp): Audit timestamps

#### weeklySync

- `id` (text, primary key): Unique weekly sync identifier
- `userId` (text, foreign key): References users.id
- `createdAt`, `updatedAt` (timestamp): Audit timestamps

#### weeklySyncItems

- `id` (text, primary key): Unique weekly sync item identifier
- `weeklySyncId` (text, foreign key): References weeklySync.id
- `trackingItemId` (text, foreign key): References trackingItems.id
- `createdAt`, `updatedAt` (timestamp): Audit timestamps

#### weeklySyncItemFiles

- `id` (text, primary key): Unique file identifier
- `weeklySyncItemId` (text, foreign key): References weeklySyncItems.id
- `fileName` (text): Original file name
- `fileType` (enum): File type (image, document, video, audio, other)
- `createdAt` (timestamp): Creation timestamp

#### goalValues (Junction Table)

- `id` (text, primary key): Unique junction identifier
- `goalId` (text, foreign key): References goals.id
- `valueId` (text, foreign key): References values.id
- `createdAt` (timestamp): Creation timestamp

### Key Relationships

- **Users** have many **Goals**, **Values**, and **WeeklySync** sessions
- **Goals** can have many child **Goals** (self-referencing hierarchy)
- **Goals** have many **Tasks** and **TrackingItems**
- **Goals** connect to other **Goals** through **Connections**
- **Goals** associate with **Values** through **GoalValues** junction table
- **TrackingItems** can be included in multiple **WeeklySyncItems**
- **WeeklySyncItems** can have multiple **WeeklySyncItemFiles**

## Information Calculated (Not Stored in Database)

### Goal Importance

Automatically calculated based on outgoing connection weights:

- **Low**: No outgoing connections or average weight d 33.3
- **Medium**: Average weight between 33.3 and 66.6
- **High**: Average weight e 66.6

### Progress Metrics

- **Task Completion Rate**: Percentage of completed tasks per goal
- **Goal Progress**: Derived from task completion and tracking item updates
- **Weekly Sync Statistics**: Aggregated data from weekly retrospectives

### Weekly Sync Data

- **Current Week Status**: Whether weekly sync exists for current week
- **Tracking Item Files**: Aggregated file counts and types per tracking item
- **Historical Progress**: Trends based on weekly sync participation

## Main Backend Endpoints and Features

### Authentication Endpoints

- `auth.authenticate`: Password-based user authentication
- `auth.getUsers`: Retrieve available users for selection
- `auth.verify`: Verify JWT token validity

### Goals Management

- `goals.goals.getAll`: Retrieve all goals with tasks and relationships
- `goals.goals.create`: Create new goal with tasks and value associations
- `goals.goals.update`: Update goal properties, tasks, and relationships
- `goals.goals.delete`: Delete goal and cascade related data

### Values Management

- `goals.values.getAll`: Retrieve user's personal values
- `goals.values.create`: Create new personal value
- `goals.values.update`: Update value properties
- `goals.values.delete`: Delete value and remove goal associations

### Tasks Management

- `goals.tasks.create`: Create new task for specific goal
- `goals.tasks.update`: Update task properties and completion status
- `goals.tasks.delete`: Delete task from goal

### Connections Management

- `goals.connections.getAll`: Retrieve all goal connections
- `goals.connections.create`: Create weighted connection between goals
- `goals.connections.update`: Update connection weight
- `goals.connections.delete`: Remove connection between goals

### Tracking Items

- `goals.trackingItems.getAll`: Get tracking items for specific goal
- `goals.trackingItems.create`: Create new tracking item
- `goals.trackingItems.update`: Update tracking item properties
- `goals.trackingItems.delete`: Soft/hard delete tracking item

### Weekly Sync Operations

- `goals.weeklySync.getByWeek`: Get weekly sync for specific week
- `goals.weeklySync.create`: Create new weekly sync session
- `goals.weeklySync.delete`: Delete weekly sync session

### Weekly Sync Items

- `goals.weeklySyncItems.getByWeeklySync`: Get items for weekly sync
- `goals.weeklySyncItems.create`: Add tracking item to weekly sync
- `goals.weeklySyncItems.delete`: Remove item from weekly sync

### File Operations

- `goals.images.upload`: Upload single image file
- `goals.images.uploadMultiple`: Upload multiple image files
- `goals.images.uploadWeeklySyncFile`: Upload file for weekly sync tracking item
- `goals.images.saveTextFile`: Save/update text content for tracking item
- `goals.images.readTextFile`: Read text file content
- `goals.images.delete`: Delete file with ownership verification

### Data Export

- `goals.data.getAll`: Export all user data (values, goals, connections)

### File Serving

- `/uploads/[...path]`: Static file serving for uploaded content

## File Storage System for Weekly Sync

### File Storage Location

Files are stored in the `uploads/` directory in the project root.

### Path Structure

```
uploads/
     {userId}_{sanitizedUserName}/
         weekly-sync/
             {goalId}/
                 {trackingItemId}/
                     images/
                         {timestamp}_{fileName}
                     documents/
                         {timestamp}_{fileName}
```

### Path Creation Logic

1. **User Folder**: `{userId}_{sanitizedUserName}` where username is sanitized by replacing special characters with underscores
2. **Weekly Sync Subfolder**: `weekly-sync/` for all retrospective files
3. **Goal Organization**: `{goalId}/` to group files by goal
4. **Tracking Item Level**: `{trackingItemId}/` for specific tracking items
5. **File Type Separation**: `images/` and `documents/` subfolders
6. **File Naming**: `{timestamp}_{originalFileName}` to prevent conflicts

### File Types Supported

- **Images**: PNG, JPG, JPEG, GIF, WebP (stored in `images/` subfolder)
- **Documents**: Text files, PDFs, and other documents (stored in `documents/` subfolder)
- **Text Content**: Directly saved as `.txt` files for note-taking

### Security Features

- **Path Validation**: Ensure files belong to the authenticated user
- **Sanitized Usernames**: Prevent directory traversal attacks
- **File Type Validation**: Validate uploaded file types
- **User-Specific Access Control**: Strict ownership verification for all file operations
- **Base64 Validation**: Validate image data before processing

### File Operations Available

- **Upload Images/Documents**: For tracking items with automatic organization
- **Save/Update Text Content**: Built-in text editor functionality
- **Read Text File Content**: Retrieve and display text files
- **Delete Files**: With strict ownership verification
- **Serve Files**: Via protected `/uploads/[...path]` route

## Important Maintenance Note

**CRITICAL**: This CLAUDE.md file must be updated every time changes are made to the project. It should never contain different information than what is actually implemented in the codebase.

### Changes Requiring Documentation Updates:

- Database schema modifications
- New or modified API endpoints
- Changes to file structure or organization
- Addition or removal of features
- Technology stack updates
- Authentication system changes
- File storage system modifications
- UI/UX component restructuring

**Responsibility**: Any developer making changes to the codebase must immediately update this documentation to maintain accuracy and usefulness for future development work.

---

_This documentation serves as the single source of truth for understanding the Goals Management Application architecture, features, and implementation details._
