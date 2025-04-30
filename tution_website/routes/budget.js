router.post('/transactions', auth, async (req, res) => {
    try {
        const {
            teacherId,
            teacherName,
            vacancyId,
            vacancyTitle,
            amount,
            amountLeft,
            dueDate,
            date,
            status,
            type
        } = req.body;

        // Validate required fields
        if (!teacherId || !teacherName || !vacancyId || !vacancyTitle || !amount || !type) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields'
            });
        }

        // Create new budget transaction
        const transaction = new Budget({
            teacherId,
            teacherName,
            vacancyId,
            vacancyTitle,
            amount,
            amountLeft: amountLeft || 0,
            dueDate,
            date: date || new Date(),
            status: status || (amountLeft > 0 ? 'partial' : 'paid'),
            type
        });

        // Save transaction
        await transaction.save();

        // Update teacher's payment status if this is a payment
        if (type === 'payment') {
            const teacher = await Teacher.findById(teacherId);
            if (teacher) {
                teacher.paymentStatus = status || (amountLeft > 0 ? 'partial' : 'paid');
                await teacher.save();
            }
        }

        res.json({
            success: true,
            data: transaction
        });
    } catch (error) {
        console.error('Budget transaction error:', error);
        res.status(500).json({
            success: false,
            message: 'Error processing budget transaction',
            error: error.message
        });
    }
}); 