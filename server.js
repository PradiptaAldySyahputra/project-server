const express = require('express');
const multer = require('multer');
const mime = require('mime-types');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const bcrypt = require('bcrypt');
const saltRounds = 10;
const conn = require('./config/db');

const app = express();

// Middleware untuk menangani JSON dan URL Encoded
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS (Jika perlu untuk akses dari luar)
app.use(cors());

// Menyiapkan folder uploads jika belum ada
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

// Setup Multer Storage untuk upload file
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir); // Tentukan folder tujuan untuk file yang di-upload
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, Date.now() + ext); // Menyimpan dengan nama file unik berdasarkan timestamp
    }
});

const upload = multer({ storage: storage });

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ======================== SERVER REGISTRASI =======================
app.post('/api/register', function(req, res) {
    const { name, email, password, role, phone } = req.body;

    // Validasi input
    if (!name || !email || !password || !role || !phone) {
        return res.status(400).json({
            success: false,
            message: 'Semua field harus diisi.'
        });
    }

    // Hash password sebelum menyimpan ke database
    bcrypt.hash(password, 10, (err, hashedPassword) => {
        if (err) {
            return res.status(500).json({
                success: false,
                message: 'Internal Server Error'
            });
        }

        // Simpan pengguna baru ke database
        const queryStr = "INSERT INTO user (name, email, password, role, phone) VALUES (?, ?, ?, ?, ?)";
        const values = [name, email, hashedPassword, role, phone];

        conn.query(queryStr, values, (err, results) => {
            if (err) {
                console.log(err);
                return res.status(500).json({
                    success: false,
                    message: 'Gagal mendaftar pengguna.'
                });
            }
            res.status(201).json({
                success: true,
                message: 'Pengguna berhasil didaftarkan.'
            });
        });
    });
});

// ======================== SERVER LOGIN =======================
app.post('/api/login', function(req, res) {
    const { email, password } = req.body;

    // Validasi input
    if (!email || !password) {
        return res.status(400).json({
            success: false,
            message: 'Email dan password harus diisi.'
        });
    }

    // Cari pengguna berdasarkan email
    const queryStr = "SELECT * FROM user WHERE email = ?";
    conn.query(queryStr, [email], (err, results) => {
        if (err) {
            console.log(err);
            return res.status(500).json({
                success: false,
                message: 'Internal Server Error'
            });
        }
        if (results.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Pengguna tidak ditemukan.'
            });
        }

        const user = results[0];

        // Bandingkan password yang dimasukkan dengan password yang tersimpan
        bcrypt.compare(password, user.password, (err, isMatch) => {
            if (err) {
                return res.status(500).json({
                    success: false,
                    message: 'Internal Server Error'
                });
            }
            if (!isMatch) {
                return res.status(401).json({
                    success: false,
                    message: 'Kredensial tidak valid.'
                });
            }

            // Jika login berhasil, kirimkan data pengguna (kecuali password)
            res.status(200).json({
                success: true,
                message: 'Login berhasil.',
                data: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    role: user.role
                }
            });
        });
    });
});

// ======================== SERVER GET USER =======================
app.get('/api/user/:id', function(req, res) {
    const userId = req.params.id;

    // Validasi input
    if (!userId) {
        return res.status(400).json({
            success: false,
            message: 'ID pengguna harus diisi.'
        });
    }

    // Cari pengguna berdasarkan ID
    const queryStr = "SELECT * FROM user WHERE id = ?";
    conn.query(queryStr, [userId], (err, results) => {
        if (err) {
            console.log(err);
            return res.status(500).json({
                success: false,
                message: 'Internal Server Error'
            });
        }
        if (results.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Pengguna tidak ditemukan.'
            });
        }

        const user = results[0];

        // Kirimkan data pengguna (kecuali password)
        res.status(200).json({
            success: true,
            message: 'Data pengguna berhasil diambil.',
            data: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role
            }
        });
    });
});

// ======================== API USER =========================
app.get('/api/get-user', function(req, res) {
    limit = req.query.limit;
    offset = req.query.offset;
    search = req.query.search;
    user_id = req.query.user_id;
    let queryStr;
    if (user_id != null){
        queryStr = "SELECT * FROM user WHERE id = " + user_id;
    }else{
        queryStr = "SELECT * FROM user WHERE deleted_at IS NULL";
        if (search){
            queryStr += `
            AND (
                LOWER(name) LIKE LOWER('%${search}%') 
                OR LOWER(phone) LIKE LOWER('%${search}%')
                OR LOWER(email) LIKE LOWER('%${search}%')
            )`;
        }
        if (limit){
            queryStr += " LIMIT " + limit;
        }
        if (offset){
            queryStr += " OFFSET " + offset;
        }
    }
    conn.query(queryStr, (err, results) => {
        if (err) {
            console.log(err);
            res.status(500).json({
                "success": false,
                "message": "Failed",
                "data": null
            });
        } else {
            res.status(200).json({
                "success": true,
                "message": "Successfully retrieved users",
                "data": results
            });
        }
    });
});

app.post('/api/add-user', upload.single('image'), function(req, res) {
    const { name, email, password, role, phone } = req.body;

    let filePath = null;
    if (req.file) {
        filePath = '/uploads/' + req.file.filename;
    }
    bcrypt.hash(password, saltRounds, (err, hashedPassword) => {
        if (err) {
            return res.status(500).json({
                "success": false,
                "message": "Internal Server Error (Hashing Error)",
                "data": null
            });
        }
        const queryStr = "INSERT INTO user (name, email, password, role, phone, image) VALUES (?, ?, ?, ?, ?, ?)";
        const values = [name, email, hashedPassword, role, phone, filePath];
        
        conn.query(queryStr, values, (err, results) => {
            if (err) {
                console.log(err);
                res.status(500).json({
                    "success": false,
                    "message": "Internal Server Error",
                    "data": null
                });
            } else {
                res.status(200).json({
                    "success": true,
                    "message": "Berhasil menambahkan data user",
                    "data": results
                });
            }
        });
    });

});

app.post('/api/update-user', upload.single('imageUpdate'), function(req, res) {
    const { name, email, role, phone, user_id } = req.body;

    let filePath = null;
    if (req.file) {
        filePath = '/uploads/' + req.file.filename;
    }

    let queryStr = "UPDATE user SET name = ?, email = ?, phone = ?, role = ?";
    let values = [name, email, phone, role];

    if (filePath != null) {
        queryStr += ", image = ?";
        values.push(filePath); 
    }

    queryStr += " WHERE id = ?";
    values.push(user_id); 
    
    conn.query(queryStr, values, (err, results) => {
        if (err) {
            console.log(err);
            res.status(500).json({
                "success": false,
                "message": "Internal Server Error",
                "data": null
            });
        } else {
            res.status(200).json({
                "success": true,
                "message": "Berhasil mengubah data user",
                "data": results
            });
        }
    });
});

app.post('/api/delete-user', function(req, res){
    const param = req.body;
    const id = param.id;
    const now = new Date(); 

    const queryStr = "UPDATE user SET deleted_at = ? WHERE id = ?";
    const values = [now, id];
    conn.query(queryStr, values, (err, results) => {
        if(err){
            console.log(err);
            res.status(500).json({
                "success": false,
                "message" : "Failed",
                "data" : null
            });
        }else{
            res.status(200).json({
                "success": true,
                "message" : "Berhasil menghapus data",
                "data" : results
            })
        }
    })
});

app.post('/api/change-password', (req, res) => {
    const { password, user_id } = req.body;

    bcrypt.hash(password, saltRounds, (err, hashedPassword) => {
        if (err) {
            return res.status(500).json({
                "success": false,
                "message": "Internal Server Error (Hashing Error)",
                "data": null
            });
        }
        const queryStr = "UPDATE user SET password = ? WHERE id = ?";
        const values = [hashedPassword, user_id];
        
        conn.query(queryStr, values, (err, results) => {
            if (err) {
                console.log(err);
                res.status(500).json({
                    "success": false,
                    "message": "Internal Server Error",
                    "data": null
                });
            } else {
                res.status(200).json({
                    "success": true,
                    "message": "Berhasil mengubah password",
                    "data": results
                });
            }
        });
    });
});

// ======================== API TICKET =======================
app.get('/api/get-ticket', function(req, res) {
    const queryStr = "SELECT * FROM ticket WHERE deleted_at IS NULL";
    conn.query(queryStr, (err, results) => {
        if (err) {
            console.log(err);
            res.status(500).json({
                "success": false,
                "message": "Failed",
                "data": null
            });
        } else {
            res.status(200).json({
                "success": true,
                "message": "Successfully retrieved tickets",
                "data": results
            });
        }
    });
});

app.post('/api/add-ticket', function(req, res) {
    const { name, email, password } = req.body;

    const queryStr = "INSERT INTO ticket (name, email, password) VALUES (?, ?, ?)";
    const values = [name, email, password];

    conn.query(queryStr, values, (err, results) => {
        if (err) {
            console.log(err);
            res.status(500).json({
                "success": false,
                "message": "Failed to add new ticket",
                "data": null
            });
        } else {
            res.status(200).json({
                "success": true,
                "message": "Successfully added new ticket",
                "data": results
            });
        }
    });
});

// ======================== API SURVEY =======================
app.get('/api/get-survey', function(req, res) {
    const queryStr = "SELECT * FROM survey WHERE deleted_at IS NULL";
    conn.query(queryStr, (err, results) => {
        if (err) {
            console.log(err);
            res.status(500).json({
                "success": false,
                "message": "Failed",
                "data": null
            });
        } else {
            res.status(200).json({
                "success": true,
                "message": "Successfully retrieved surveys",
                "data": results
            });
        }
    });
});

// ======================== API TECHNICIAN TEAM =======================
app.get('/api/get-technician-team', function(req, res) {
    const queryStr = "SELECT * FROM technician_team WHERE deleted_at IS NULL";
    conn.query(queryStr, (err, results) => {
        if (err) {
            console.log(err);
            res.status(500).json({
                "success": false,
                "message": "Failed",
                "data": null
            });
        } else {
            res.status(200).json({
                "success": true,
                "message": "Successfully retrieved technician team",
                "data": results
            });
        }
    });
});

// ======================== SERVER START =======================
app.get('/', (req, res) => {
    res.send('Hello, world!');
});

app.listen(3000, () => {
    console.log('Server running on http://localhost:3000');
});


