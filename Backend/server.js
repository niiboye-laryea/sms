// import { express, request } from 'express';
// import { mongoose, modelNames } from 'mongoose';
// import cors from 'cors';
// import morgan from 'morgan';
// import winston from 'winston';
// require('dotenv').config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
require('dotenv').config();
const morgan = require("morgan");
const winston = require("winston");

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

//  **************************************************
//  ************* COURSE API STARTS HERE *************
//  **************************************************

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

// Create course api
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

// Delete a course api
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

// Retrieve a single course by ID
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
//  **************************************************
//  ************* COURSE API ENDS HERE *************
//  **************************************************

//  **************************************************
//  ************* STUDENT API STARTS HERE ************
//  **************************************************

// Retrieve all the students
app.get('/api/students', async (req, res) => {
    try {
        const students = await Student.find().sort({ createAt: -1 });
        logger.info(`Retrieved ${students.length} students successfully.`);
        res.json(students);
    } catch (error) {
        logger.error('Error fetching students.');
        res.status(500).json({ message: error.message });
    }
});

// Add new student
app.post('/api/students', async (req, res) => {
    try {
        const student = new Student(req.body);
        const savedStudent = await student.save();

        logger.info('New student created successfully: ', {
            studentId: savedStudent._id,
            name: savedStudent.name,
            course: savedStudent.course,
        });

        res.status(201).json(savedStudent);
    } catch (error) {
        logger.error('Error creating student record: ', error);
        res.status(400).json({ message: error.message });
    }
});

// Edit student record
app.put('/api/students/:id', async (req, res) => {
    try {
        const student = await Student.findByIdAndUpdate(req.params.id, req.body, {
            new: true,
        });

        if(!student) {
            logger.warn('Student record not found: ', {
                studentId: req.params.id,
            });

            return res.status(404).json({ message: 'Student record not found' });
        }

        logger.info('Student record updated successfully: ', {
            studentId: student._id,
            name: student.name,
            course: student.course,
        });

        res.json(student);
    } catch (error) {
        logger.error('Error updating student record: ', error);
        res.status(400).json({ message: error.message });
    }
});

// Delete student record
app.delete('/api/students/:id', async (req, res) => {
    try {
        const studentRecord = await Student.findByIdAndDelete(req.params.id);
        if(!student) {
            logger.warn('Student record not found: ', {
                studentId: req.params.id,
            });

            return res.status(404).json({ message: 'Student record not found.' });
        }

        logger.info('Student record deleted successfully: ', {
            studentId: student._id,
            name: student.name,
            course: student.course,
        });

        res.json({ message: 'Student record deleted successfully.' });
    } catch (error) {
        logger.error('Error deleting student record: ', error);
        res.status(500).json({ message: error.message });
    }
});

// Retrieve a student's record
app.get('/api/students/search', async (req, res) => {
    try {
        const searchTerm = req.query.q;
        logger.info('Student search initiated: ', searchTerm);

        const students = await Student.find({
            $or: [
                { name: { 
                    $regex: searchTerm, $option: 'i'
                } },
                { course: {
                    $regex: searchTerm, $option: 'i'
                }},
                { email: {
                    $regex: searchTerm, $option: 'i'
                }}
            ]
        });

        logger.info('Student search completed: ', {
            searchTerm, resultsCount: students.length,
        });

        res.json(students);

    } catch (error) {
        logger.error('Error fetching student record: ', error);
        res.status(500).json({ message: error.message });
    }
});

// Retrieve student record by ID
app.get('/api/students/:id', async (req, res) => {
    try {
        const student = await Student.findById(req.params.id);
        if(!student) {
            logger.warn('Student record not found', {
                studentId: req.params.id
            });

            return res.status(404).json({ message: 'Student record not found.' });
        }
    } catch (error) {
        logger.error('Error fetching student record', error);
        res.status(500).json({ message: error.message });
    }
});

// Dashboard stats api 
app.get('/api/dashboard/stats', async (req, res) => {
    try {
        const stats = await getDashboardStats();
        logger.info('Dashboard statistics retrieved successfully: ', stats);
        res.json(stats);
    } catch (error) {
        logger.error('Error retrieving dashboard statistics', error);
        res.status(500).json({ message: error.message });
    }
});

// Help function for dashboard statistics
async function getDashboardStats() {
    const totalStudents = await Student.countDocuments();
    const activeStudents = await Student.countDocuments({ status: 'Active' });
    const totalCourses = await Course.countDocuments();
    const activeCourses = await Course.countDocuments({ status: 'Active' });
    const graduates = await Student.countDocuments({ status: 'Inactive' });
    const courseCounts = await Course.aggregate([
        { $group: {
            _id: '$course', count: { $sum: 1 }
        }}
    ]);

    return {
        totalStudents, 
        totalCourses, 
        activeStudents, 
        activeCourses, 
        graduates, 
        courseCounts, 
        successRate: totalStudents > 0 ? Math.round((graduates / totalStudents) * 100) : 0
    };
};

// Basic health check
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'UP',
        timestamp: new Date(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development',
    });
});

// Detailed health check
app.get('/health/detail', async (req, res) => {
    try {
        const dbStatus = mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected';

        // Get system metrics
        const systemInfo = {
            memory: {
                total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
                used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
                unit: 'MB',
            },
            uptime: {
                seconds: Math.round(process.uptime()),
                formatted: formattedUptime(process.uptime()),
            },
            nodeVersion: process.version,
            platform: process.platform,
        };

        const healthCheck = {
            status: 'UP',
            timestamp: new Date(),
            database: {
                status: dbStatus,
                name: 'mongoDB',
                host: mongoose.connection.host,
            },
            system: systemInfo,
            environment: process.env.NODE_ENV || 'development',
        };

        res.status(200).json(healthCheck);
    } catch (error) {
        res.status(500).json({
            status: 'DOWN',
            timestamp: new Date(),
            message: error.message,
        });
    }
});

function formattedUptime(seconds) {
    const parts = [];

    const days = Math.floor(seconds / (3600 * 24));
    const hours = Math.floor((seconds % (3600 * 24)) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = Math.floor(seconds % 60);

    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (remainingSeconds > 0) parts.push(`${remainingSeconds}s`);

    return parts.join(' ');
}

// Start server
const PORT = process.env.PORT || 3000;

// Listen
app.listen(PORT, () => {
    console.log(`Server is running on ${PORT}`);
});