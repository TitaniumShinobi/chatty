# Chatty Backend API

A full-stack Node.js/Express backend for the Chatty AI chat application with user authentication, real-time features, and data persistence.

## 🚀 Features

- **User Authentication**: JWT-based auth with email verification
- **Database**: MongoDB with Mongoose ODM
- **Real-time**: Socket.IO for live updates
- **File Upload**: Multer for file handling
- **Email Service**: Nodemailer for verification emails
- **Backup System**: Automated data backups
- **Rate Limiting**: Express rate limiter
- **Security**: Helmet, CORS, input validation

## 📋 Prerequisites

- Node.js 18+ 
- MongoDB 5+
- npm or yarn

## 🛠️ Installation

1. **Clone the repository**
   ```bash
   cd server
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment Setup**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` with your configuration:
   ```env
   PORT=5000
   NODE_ENV=development
   MONGODB_URI=mongodb://localhost:27017/chatty
   JWT_SECRET=your-super-secret-jwt-key-here
   JWT_REFRESH_SECRET=your-super-secret-refresh-key-here
   FRONTEND_URL=http://localhost:3000
   ```

4. **Start MongoDB**
   ```bash
   # Local MongoDB
   mongod
   
   # Or use MongoDB Atlas (cloud)
   # Update MONGODB_URI in .env
   ```

5. **Run the server**
   ```bash
   # Development
   npm run dev
   
   # Production
   npm start
   ```

## 📁 Project Structure

```
server/
├── config/
│   └── database.js          # MongoDB connection
├── middleware/
│   ├── auth.js             # JWT authentication
│   └── errorHandler.js     # Error handling
├── models/
│   ├── User.js             # User model
│   ├── Conversation.js     # Conversation model
│   └── GPT.js              # Custom GPT model
├── routes/
│   ├── auth.js             # Authentication routes
│   ├── users.js            # User management
│   ├── conversations.js    # Chat conversations
│   ├── gpts.js             # Custom GPTs
│   └── files.js            # File uploads
├── services/
│   ├── emailService.js     # Email functionality
│   └── backupService.js    # Data backup
├── server.js               # Main server file
└── package.json
```

## 🔌 API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - User login
- `GET /api/auth/verify/:token` - Verify email
- `POST /api/auth/forgot-password` - Request password reset
- `POST /api/auth/reset-password` - Reset password
- `POST /api/auth/refresh` - Refresh JWT token

### Conversations
- `GET /api/conversations` - Get user conversations
- `POST /api/conversations` - Create new conversation
- `GET /api/conversations/:id` - Get single conversation
- `PUT /api/conversations/:id` - Update conversation
- `DELETE /api/conversations/:id` - Delete conversation
- `POST /api/conversations/:id/messages` - Add message

### Custom GPTs
- `GET /api/gpts` - Get user's GPTs
- `POST /api/gpts` - Create new GPT
- `PUT /api/gpts/:id` - Update GPT
- `DELETE /api/gpts/:id` - Delete GPT

### Users
- `GET /api/users/profile` - Get user profile
- `PUT /api/users/profile` - Update profile
- `PUT /api/users/settings` - Update settings

## 🔐 Authentication

The API uses JWT tokens for authentication:

1. **Login/Register** returns access and refresh tokens
2. **Include token** in Authorization header: `Bearer <token>`
3. **Refresh token** when access token expires

## 📊 Database Schema

### User
- Email, password, name
- Subscription level (free/plus/pro)
- Settings and preferences
- Usage statistics

### Conversation
- User reference
- Messages array
- Active GPT reference
- Metadata and tags

### GPT (Custom AI)
- User reference
- Name, description, instructions
- Capabilities and model settings
- Usage statistics

## 🔄 Real-time Features

Socket.IO handles real-time updates:
- User typing indicators
- Live message updates
- Online status
- Notification delivery

## 📧 Email Service

Configure email settings in `.env`:
```env
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password
```

## 💾 Backup System

Automated backups run daily:
- Database dumps
- File system backups
- Cloud storage integration

## 🚀 Deployment

### Heroku
```bash
heroku create chatty-backend
heroku config:set NODE_ENV=production
heroku config:set MONGODB_URI=your-mongodb-uri
git push heroku main
```

### Docker
```bash
docker build -t chatty-backend .
docker run -p 5000:5000 chatty-backend
```

### Environment Variables
- `PORT` - Server port
- `MONGODB_URI` - Database connection
- `JWT_SECRET` - JWT signing secret
- `FRONTEND_URL` - Frontend domain
- `EMAIL_*` - Email configuration

## 🧪 Testing

```bash
npm test
```

## 📝 License

MIT License - see LICENSE file for details.

## 🤝 Contributing

1. Fork the repository
2. Create feature branch
3. Commit changes
4. Push to branch
5. Create Pull Request

## 📞 Support

For support, email support@chatty.com or create an issue.
