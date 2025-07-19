# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Development Commands

```bash
# Development
npm run dev              # Start development server with Shopify CLI
npm run build            # Build the application for production
npm run start            # Start production server
npm run lint             # Run ESLint
npm run setup            # Generate Prisma client and run migrations

# Database operations
npm run prisma           # Access Prisma CLI
npx prisma generate      # Generate Prisma client
npx prisma migrate deploy # Deploy migrations

# Shopify-specific commands
npm run deploy           # Deploy app to Shopify
npm run config:link      # Link app configuration
npm run generate         # Generate Shopify app components
npm run test:webhook     # Test webhook functionality
```

## Application Architecture

This is a Shopify app built with the Remix framework, featuring a React frontend and Node.js backend. The application follows Shopify's embedded app pattern and includes a theme extension.

### Core Structure

- **Remix App**: Main application using file-based routing in `app/routes/`
- **Database**: MySQL with Prisma ORM for session storage and app data
- **Authentication**: Shopify OAuth with session persistence via Prisma
- **Theme Extension**: Shopify theme extension in `extensions/voicero/`

### Key Architecture Components

1. **Shopify Integration** (`app/shopify.server.js`):
   - Configured with Prisma session storage
   - Custom distribution with embedded auth strategy
   - Supports custom shop domains

2. **Main App Layout** (`app/routes/app.jsx`):
   - Shopify App Bridge integration
   - Polaris UI components with custom purple theme (#882be6)
   - Navigation menu with 5 main sections: Home, AI Overview, Customize Chatbot, Contacts, Settings

3. **Database Schema** (`prisma/schema.prisma`):
   - MySQL provider
   - Session model for Shopify OAuth data storage
   - Includes user profile fields (firstName, lastName, email, etc.)

4. **API Routes**: RESTful endpoints in `app/routes/api.*.js` for:
   - Contact management
   - AI history
   - User settings
   - Webhook handling
   - Customer status management

5. **Theme Extension** (`extensions/voicero/`):
   - Shopify theme extension with JavaScript assets
   - Customer interaction components
   - Order and support management functionality

### Application Features

The app appears to be a voice/AI-powered customer service solution with:
- Contact management system
- AI conversation overview
- Customizable chatbot interface
- Customer interaction tracking
- Integration with Shopify orders and customer data

### Development Notes

- Uses MySQL database (not SQLite as in template)
- Custom Polaris theme with purple branding
- Embedded app with App Bridge for Shopify Admin integration
- Supports custom shop domains via environment configuration
- Theme extension includes comprehensive customer interaction assets