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
    const { name, email, password, role, phone, team_id } = req.body;

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
        const queryStr = "INSERT INTO user (name, email, password, role, phone, team_id, image) VALUES (?, ?, ?, ?, ?, ?, ?)";
        const values = [name, email, hashedPassword, role, phone, team_id, filePath];
        
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
    const { name, email, role, phone, user_id, team_id } = req.body;

    let filePath = null;
    if (req.file) {
        filePath = '/uploads/' + req.file.filename;
    }

    let queryStr = "UPDATE user SET name = ?, email = ?, phone = ?, role = ?, team_id = ?";
    let values = [name, email, phone, role, team_id];

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
    limit = req.query.limit;
    offset = req.query.offset;
    search = req.query.search;
    survey_id = req.query.survey_id;
    
    let queryStr;

    if (survey_id != null) {
        queryStr = "SELECT id, title, project, description, DATE_FORMAT(survey_date, '%d %b %Y') AS survey_date FROM survey WHERE id = " + survey_id;
    } else {
        queryStr = "SELECT id, title, project, description, DATE_FORMAT(survey_date, '%d %b %Y') AS survey_date FROM survey WHERE deleted_at IS NULL";
        
        if (search) {
            queryStr += ` AND LOWER(title) LIKE LOWER('%${search}%')`;
        }
        
        if (limit) {
            queryStr += " LIMIT " + limit;
        }
        if (offset) {
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
                "message": "Successfully retrieved surveys",
                "data": results
            });
        }
    });
});


app.get('/api/get-survey-images', function(req, res) {
    survey_id = req.query.survey_id;
    let queryStr = "SELECT * FROM survey_images WHERE survey_id = " + survey_id;
    conn.query(queryStr, (err, results) => {
        if (err) {
            console.log(err);
            res.status(500).json({
                "success": false,
                "message": "Failed",
                "data": null
            });
        } else {
            console.log("resulstt -->", results)
            res.status(200).json({
                "success": true,
                "message": "Successfully retrieved survey images",
                "data": results
            });
        }
    });
});

app.post('/api/add-survey', upload.array('surveyImages', 10), (req, res) => {
    const { title, project, description, survey_date } = req.body;

    // Log untuk memastikan data yang diterima
    console.log("======masuk kesini");
    console.log(title, project, description, survey_date);

    conn.beginTransaction((err) => {
        if (err) {
        return res.status(500).json({
            success: false,
            message: "Error starting transaction",
            data: null
        });
        }

        const queryStr = "INSERT INTO survey (title, project, description, survey_date) VALUES (?, ?, ?, ?)";
        const values = [title, project, description, survey_date];

        conn.query(queryStr, values, (err, results) => {
        if (err) {
            console.log(err);
            return conn.rollback(() => {
                res.status(500).json({
                    success: false,
                    message: "Error inserting survey",
                    data: null
                });
            });
        }

        const surveyId = results.insertId;

        if (req.files && req.files.length > 0) {
            const fileQueries = req.files.map((file) => {
            return new Promise((resolve, reject) => {
                const imagePath = '/uploads/' + file.filename;
                const insertImageQuery = "INSERT INTO survey_images (survey_id, image) VALUES (?, ?)";
                const imageValues = [surveyId, imagePath];

                conn.query(insertImageQuery, imageValues, (err, imageResults) => {
                if (err) {
                    console.log(err);
                    return reject(err);
                }
                resolve(imageResults);
                });
            });
            });

            Promise.all(fileQueries)
            .then(() => {
                conn.commit((err) => {
                if (err) {
                    console.log(err);
                    return conn.rollback(() => {
                    res.status(500).json({
                        success: false,
                        message: "Error committing transaction",
                        data: null
                    });
                    });
                }

                res.status(200).json({
                    success: true,
                    message: "Survey and images added successfully",
                    data: results
                });
                });
            })
            .catch((err) => {
                console.log(err);
                conn.rollback(() => {
                res.status(500).json({
                    success: false,
                    message: "Error inserting images",
                    data: null
                });
                });
            });
        } else {
            conn.commit((err) => {
            if (err) {
                console.log(err);
                return conn.rollback(() => {
                res.status(500).json({
                    success: false,
                    message: "Error committing transaction",
                    data: null
                });
                });
            }

            res.status(200).json({
                success: true,
                message: "Survey added successfully without images",
                data: results
            });
            });
        }
        });
    });
});

app.post('/api/delete-survey', function(req, res){
    const param = req.body;
    const id = param.id;
    const now = new Date(); 

    const queryStr = "UPDATE survey SET deleted_at = ? WHERE id = ?";
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

// ======================== API TECHNICIAN TEAM =======================
app.get('/api/get-technician-team', function(req, res) {
    limit = req.query.limit;
    offset = req.query.offset;
    search = req.query.search;
    let queryStr = "SELECT * FROM technician_team WHERE deleted_at IS NULL";
    if (search){
        queryStr += ` AND LOWER(name) LIKE LOWER('%${search}%')`;
    }
    queryStr += " ORDER BY name ASC";
    if (limit){
        queryStr += " LIMIT " + limit;
    }
    if (offset){
        queryStr += " OFFSET " + offset;
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
                "message": "Successfully retrieved technician team",
                "data": results
            });
        }
    });
});

app.post('/api/add-technician-team', upload.single('imageTechnicianTeam'), function(req, res) {
    const { name } = req.body;

    let filePath = null;
    if (req.file) {
        filePath = '/uploads/' + req.file.filename;
    }

    const queryStr = "INSERT INTO technician_team (name, image) VALUES (?, ?)";
    const values = [name, filePath];
    
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
                "message": "Berhasil menambahkan data tim teknisi",
                "data": results
            });
        }
    });

});

app.post('/api/update-technician-team', upload.single('imageUpdateTechnicianTeam'), function(req, res) {
    const { name, team_id } = req.body;

    let filePath = null;
    if (req.file) {
        filePath = '/uploads/' + req.file.filename;
    }

    let queryStr = "UPDATE technician_team SET name = ?";
    let values = [name];

    if (filePath != null) {
        queryStr += ", image = ?";
        values.push(filePath); 
    }

    queryStr += " WHERE id = ?";
    values.push(team_id); 
    
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
                "message": "Berhasil mengubah data tim teknisi",
                "data": results
            });
        }
    });
});

app.post('/api/delete-technician-team', function(req, res){
    const param = req.body;
    const id = param.id;
    const now = new Date(); 

    const queryStr = "UPDATE technician_team SET deleted_at = ? WHERE id = ?";
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

app.get('/api/get-technician', function(req, res) {
    console.log("called here\n\n")
    limit = req.query.limit;
    offset = req.query.offset;
    search = req.query.search;
    user_id = req.query.user_id;
    let queryStr;
    if (user_id != null){
        queryStr = "SELECT u.*, tt.name AS team FROM user AS u LEFT JOIN technician_team AS tt ON u.team_id = tt.id WHERE u.role = 'technician' AND u.id = " + user_id;
    }else{
        queryStr = "SELECT u.*, tt.name AS team FROM user AS u LEFT JOIN technician_team AS tt ON u.team_id = tt.id WHERE u.role = 'technician' AND u.deleted_at IS NULL";
        if (search){
            queryStr += `
            AND (
                LOWER(u.name) LIKE LOWER('%${search}%') 
                OR LOWER(u.phone) LIKE LOWER('%${search}%')
                OR LOWER(u.email) LIKE LOWER('%${search}%')
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
            console.log(results);
            res.status(200).json({
                "success": true,
                "message": "Successfully retrieved users",
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


