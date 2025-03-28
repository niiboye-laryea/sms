import express, { request } from 'express';
import mongoose, { modelNames } from 'mongoose';
import cors from 'cors';
import morgan from 'morgan';
import winston from 'winston';
require('dotenv').config();

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Connect to the mongo database
mongoose.connect(process.env.MONGODB_URI || "mongodb://localhost:27017/sms", {
    useNewUrlParser: true,
    useUnifiedTopology: true,
}).then(() => console.log("connected to mongodb")).catch(
    (err) => console.error("Mongodb connection error: ", err)
);

// Log every single action performed
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({filename: 'error.log', level: 'error'}),
        new winston.transports.File({filename: 'combined.log'}),
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            )
        })
    ],
});

app.use(
    morgan(':method :url :status :response-time ms - res[content-length]')
);

const apiLogger = (req, res, next) => {
    const start = Date.now();

    res.on('finish', () => {
        const duration = Date.now() - start;

        logger.info({
            method: req.method,
            path: req.path,
            status: res.statusCode,
            duration: `${duration}ms`,
            params: req.params,
            query: req.query,
            body: req.method !== 'GET' ? req.body : undefined 
        });
    });

    next();
}

app.use(apiLogger);

// Error handling middleware
app.use((err, req, res, next) => {
    logger.error({
        message: err.message,
        stack: err.stack,
        method: req.method,
        path: req.path,
        params: req.params,
        query: req.query,
        body: req.method !== 'GET' ? req.body : undefined 
    });

    res.status(500).json({
        message: 'Internal server error'
    });
});

// Student schema
const studentSchema = mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    course: { type: String, required: true },
    enrollmentDate: { type: Date, required: true },
    status: { type: String, enum: ['Active', 'Inactive'], default: 'Active'}
}, { timestamps: true });

const student = mongoose.model("Student", studentSchema);

// Course schema
const courseSchema = mongoose.Schema({
    name: { type: String, required: true, unique: true },
    description: { type: String, required: true },
    duration: { type: Number, required: true },
    status: { type: String, enum: ['Active', 'Inactive'], default: 'Active'}
}, { timestamps: true });

const course = mongoose.model('Course', courseSchema);

// Retrieve all courses api
app.get('/api/courses', async (req, res) => {
    try {
        const courses = await Course.find().sort({ name: 1 });
        logger.info(`Retrieved ${course.length} courses successfully.`);
        res.json(courses);
    } catch (error) {
        logger.error('Error fetching courses: ', error);
        res.status(500).json({ message: error.message });
    }
});

// Store course api
app.post('/api/courses', async (req, res) => {
    try {
        const newCourse = new Course(req.body);
        const savedCourse = await newCourse.save();

        logger.info('New course created: ', {
            courseId: savedCourse._id,
            name: savedCourse.name
        });

        res.status(201).json(savedCourse);
    } catch (error) {
        logger.error('Error creating course: ', error);
        res.status(400).json({ message: error.message });
    }
});

// Update a course
app.put('/api/courses/:id', async (req, res) => {
    try {
        const course = await Course.findByIdAndUpdate(
            req.params.id, request.body, { new: true }
        );

        if(!course) {
            logger.warn('Course not found for update: ', { courseId: req.params.id });
            
            return res.status(404).json({ message: 'Course not found' });
        }

        logger.info('Course updated succesfully.', {
            courseId: course._id,
            name: course.name
        });
    } catch (error) {
        logger.error('Error updating course: ', error);
        res.status(400).json({ message: error.message });
    }
});

// Delete course api
app.delete('/api/courses/:id', async (req, res) => {
    try {
        const enrolledStudents = await Student.countDocuments({ course: req.params.id, });
        if(enrolledStudents > 0) {
            logger.warn('Attempted to delete course with enrolled student: ', {
                courseId: req.params.id, enrolledStudents
            });

            return res.status(400).json({
                message: 'Cannot delete course with enrolled students'
            });
        }

        const course = await Course.findByIdAndDelete(req.params.id);
        if(!course) {
            logger.warn('Course not found for deletion: ', { courseId: req.params.id });
            return res.status(404).json({ message: 'Course not found' });
        }

        logger.info('Course deleted successfully: ', {
            courseId: course._id,
            name: course.name
        });

        res.json({ message: 'Course deleted successfully.'});
    } catch (error) {
        logger.error('Error deleting course: ', error);
        res.status(400).json({ message: error.message });
    }
});

// Find a single course by ID
app.get('/api/course/:id', async (req, res) => {
    try {
        const course = await Course.findById(req.params.id);
        if(!course) {
            return res.status(400).json({ message: 'Course not found' });
        }

        res.json(course);
    } catch (error) {
        logger.error('Error fetching course: ', error);
        res.status(400).json({ message: error.message });
    }
});