const jwt = require('jsonwebtoken');
const Teacher = require('../models/TeacherApply');
const Admin = require('../models/Admin');

module.exports = async (req, res, next) => {
   try {
       // Get token and handle potential undefined header
       const authHeader = req.header('Authorization');
       if (!authHeader) {
           console.log('No Authorization header');
           return res.status(401).json({
               success: false,
               message: 'No authorization header found'
           });
       }

       const token = authHeader.replace('Bearer ', '');
       if (!token) {
           console.log('Empty token');
           return res.status(401).json({
               success: false,
               message: 'No token provided'
           });
       }

       try {
           // Verify token and handle potential JWT errors
           const decoded = jwt.verify(token, process.env.JWT_SECRET);
           console.log('Decoded token:', decoded);

           if (!decoded.id) {
               console.log('No ID in token');
               return res.status(401).json({
                   success: false,
                   message: 'Invalid token format'
               });
           }

           // Check if the user is an admin
           if (decoded.role === 'admin') {
               const admin = await Admin.findById(decoded.id);
               if (!admin) {
                   console.log('No admin found with ID:', decoded.id);
                   return res.status(401).json({
                       success: false,
                       message: 'Admin not found'
                   });
               }
               req.user = {
                   id: admin._id,
                   email: admin.email,
                   username: admin.username,
                   role: 'admin'
               };
           } else {
               // Find teacher if not admin
               const teacher = await Teacher.findById(decoded.id);
               if (!teacher) {
                   console.log('No teacher found with ID:', decoded.id);
                   return res.status(401).json({
                       success: false,
                       message: 'Teacher not found'
                   });
               }
               req.user = {
                   id: teacher._id,
                   email: teacher.email,
                   fullName: teacher.fullName,
                   role: 'teacher'
               };
           }

           console.log('User authenticated:', req.user.id, 'Role:', req.user.role);
           next();
       } catch (jwtError) {
           console.error('JWT verification error:', jwtError);
           return res.status(401).json({
               success: false,
               message: 'Invalid or expired token'
           });
       }
   } catch (error) {
       console.error('Auth middleware error:', error);
       return res.status(500).json({
           success: false,
           message: 'Internal server error during authentication'
       });
   }
};