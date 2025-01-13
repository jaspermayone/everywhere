import multer from 'multer';
import fs from 'fs';
import path from 'path';

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
	fs.mkdirSync(uploadsDir);
}

// Configure multer for file uploads
export default multer({
	dest: 'uploads/',
	limits: {
		fileSize: 1024 * 1024 * 10, // 10MB limit initially (we'll resize later)
		files: 4 // Maximum 4 files (Bluesky's limit)
	},
	fileFilter: (req, file, cb) => {
		const allowedTypes = ['image/jpeg', 'image/png', 'image/gif'];
		if (!allowedTypes.includes(file.mimetype)) {
			cb(new Error('Invalid file type. Only JPEG, PNG and GIF are allowed'));
			return;
		}
		cb(null, true);
	}
});
