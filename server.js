const express = require('express');
const multer = require('multer');
const mime = require('mime-types');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const bcrypt = require('bcrypt');
const saltRounds = 10;
const conn = require('./config/db');
const { format } = require('date-fns');

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
    console.log("kepanggil");
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
    console.log("get user============")
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
        const values = [name, email, hashedPassword, role, phone, team_id || null, filePath];
        
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
    let values = [name, email, phone, role, team_id || null];

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
    limit = req.query.limit;
    offset = req.query.offset;
    search = req.query.search;
    startDate = req.query.startDate;
    endDate = req.query.endDate;
    state = req.query.state;
    applyFilter = req.query.applyFilter;
    ticket_id = req.query.ticket_id;

    let queryStr;
    if (ticket_id != null){
        queryStr = "SELECT t.id, t.title, t.description, t.state, u.name AS technician_name, DATE_FORMAT(t.created_at, '%d %b %Y %H:%i') AS created_at FROM ticket AS t LEFT JOIN user AS u ON u.id = t.technician_id WHERE t.id = " + ticket_id;
    }else{
        queryStr = "SELECT t.id, t.title, t.description, t.state, u.name AS technician_name, DATE_FORMAT(t.created_at, '%d %b %Y %H:%i') AS created_at FROM ticket AS t LEFT JOIN user AS u ON u.id = t.technician_id WHERE t.deleted_at IS NULL";
        if (search){
            queryStr += ` AND LOWER(title) LIKE LOWER('%${search}%') `;
        }

        if (applyFilter != 'false' && startDate) {
            queryStr += ` AND t.created_at >= '${format(new Date(startDate), 'yyyy-MM-dd 00:00:00')}'`;
        }

        if (applyFilter != 'false' && endDate) {
            queryStr += ` AND t.created_at <= '${format(new Date(endDate), 'yyyy-MM-dd 23:59:59')}'`;
        }
        if (applyFilter != 'false' && state != 'all') {
            queryStr += ` AND t.state = '${state}'`;
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
                "message": "Successfully retrieved tickets",
                "data": results
            });
        }
    });
});

app.post('/api/add-ticket', function(req, res) {
    const { title, description } = req.body;

    const queryStr = "INSERT INTO ticket (title, description) VALUES (?, ?)";
    const values = [title, description];

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

app.post('/api/delete-ticket', function(req, res){
    const param = req.body;
    const id = param.id;
    const now = new Date(); 

    const queryStr = "UPDATE ticket SET deleted_at = ? WHERE id = ?";
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

app.post('/api/assign-ticket', function(req, res){
    const param = req.body;
    const ticket_id = param.ticket_id;
    const technician_id = param.technician_id;
    console.log("assign tect")
    console.log(ticket_id);
    console.log(technician_id);

    const queryStr = "UPDATE ticket SET technician_id = ?, state='in_progress' WHERE id = ?";
    const values = [technician_id, ticket_id];
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
                "message" : "Berhasil mengubah data",
                "data" : results
            })
        }
    })
});

app.post('/api/update-ticket', function(req, res) {
    const { title, description, ticket_id } = req.body;

    const queryStr = "UPDATE ticket SET title = ? , description = ? WHERE id = ?";
    const values = [title, description, ticket_id];

    conn.query(queryStr, values, (err, results) => {
        if (err) {
            console.log(err);
            res.status(500).json({
                "success": false,
                "message": "Failed to update ticket",
                "data": null
            });
        } else {
            res.status(200).json({
                "success": true,
                "message": "Successfully update new ticket",
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
    startDate = req.query.startDate;
    endDate = req.query.endDate;
    state = req.query.state;
    applyFilter = req.query.applyFilter;
    survey_id = req.query.survey_id;
    
    let queryStr;

    if (survey_id != null) {
        queryStr = "SELECT id, title, project, description, DATE_FORMAT(survey_date, '%d %b %Y') AS survey_date FROM survey WHERE id = " + survey_id;
    } else {
        queryStr = "SELECT id, title, project, description, DATE_FORMAT(survey_date, '%d %b %Y') AS survey_date FROM survey WHERE deleted_at IS NULL";
        
        if (search) {
            queryStr += ` AND LOWER(title) LIKE LOWER('%${search}%')`;
        }

        if (applyFilter != 'false' && startDate) {
            queryStr += ` AND survey_date >= '${format(new Date(startDate), 'yyyy-MM-dd HH:mm:ss')}'`;
        }

        if (applyFilter != 'false' && endDate) {
            queryStr += ` AND survey_date <= '${format(new Date(endDate), 'yyyy-MM-dd HH:mm:ss')}'`;
        }
        if (applyFilter != 'false' && state != 'all') {
            queryStr += ` AND state = '${state}'`;
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

app.post('/api/update-survey', upload.array('surveyUpdateImages', 10), (req, res) => {
    const { survey_id, title, project, description, survey_date, existed_images } = req.body;

    console.log(title, project, description, survey_date);
    console.log(existed_images);

    conn.beginTransaction((err) => {
        if (err) {
            return res.status(500).json({
                success: false,
                message: "Error starting transaction",
                data: null
            });
        }

        // Step 1: Update survey data
        const queryStr = "UPDATE survey SET title = ?, project = ?, description = ?, survey_date = ? WHERE id = ?";
        const values = [title, project, description, survey_date, survey_id];

        conn.query(queryStr, values, (err, results) => {
            if (err) {
                console.log(err);
                return conn.rollback(() => {
                    res.status(500).json({
                        success: false,
                        message: "Error updating survey",
                        data: null
                    });
                });
            }

            // Step 2: Get all images for the current survey_id
            const getImagesQuery = "SELECT id FROM survey_images WHERE survey_id = ?";
            conn.query(getImagesQuery, [survey_id], (err, existingImages) => {
                if (err) {
                    console.log(err);
                    return conn.rollback(() => {
                        res.status(500).json({
                            success: false,
                            message: "Error fetching existing images",
                            data: null
                        });
                    });
                }

                const existedImageIds = Array.isArray(existed_images) 
                    ? existed_images.map(image => image.id) 
                    : [];

                const imagesToDelete = existingImages.filter(image => {
                    return !existedImageIds.includes(image.id.toString()); 
                });


                if (imagesToDelete.length > 0) {
                    const imageIdsToDelete = imagesToDelete.map(image => image.id);
                    const deleteImagesQuery = "DELETE FROM survey_images WHERE survey_id = ? AND id IN (?)";
                    conn.query(deleteImagesQuery, [survey_id, imageIdsToDelete], (err, deleteResults) => {
                        if (err) {
                            console.log(err);
                            return conn.rollback(() => {
                                res.status(500).json({
                                    success: false,
                                    message: "Error deleting images",
                                    data: null
                                });
                            });
                        }

                        console.log(`Deleted ${deleteResults.affectedRows} image(s).`);
                    });
                }

                // Step 4: Insert new images if provided
                if (req.files && req.files.length > 0) {
                    const fileQueries = req.files.map((file) => {
                        return new Promise((resolve, reject) => {
                            const imagePath = '/uploads/' + file.filename;
                            const insertImageQuery = "INSERT INTO survey_images (survey_id, image) VALUES (?, ?)";
                            const imageValues = [survey_id, imagePath];

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
                                    message: "Survey and images updated successfully",
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
                            message: "Survey updated successfully without new images",
                            data: results
                        });
                    });
                }
            });
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


// ======================== API PROJECT =======================
app.get('/api/get-project', function(req, res) {
    limit = req.query.limit;
    offset = req.query.offset;
    search = req.query.search;
    project_id = req.query.project_id;

    let queryStr;
    if (project_id != null){
        queryStr = "SELECT p.id, p.name, p.company, p.company_address, p.source_service, u.name AS technician_name, DATE_FORMAT(p.project_date, '%d %b %Y') AS project_date FROM project AS p LEFT JOIN user AS u ON u.id = p.user_id WHERE p.id = " + project_id;
    }else{
        queryStr = "SELECT p.id, p.name, p.company, p.company_address, p.source_service, u.name AS technician_name, DATE_FORMAT(p.project_date, '%d %b %Y') AS project_date FROM project AS p LEFT JOIN user AS u ON u.id = p.user_id WHERE p.deleted_at IS NULL";
        if (search){
            queryStr += `
            AND (
                LOWER(p.name) LIKE LOWER('%${search}%') 
                OR LOWER(p.company) LIKE LOWER('%${search}%')
                OR LOWER(p.company_address) LIKE LOWER('%${search}%')
                OR LOWER(p.source_service) LIKE LOWER('%${search}%')
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
                "message": "Successfully retrieved tickets",
                "data": results
            });
        }
    });
});

app.post('/api/add-project', function(req, res) {
    const param = req.body;
    const name = param.name;
    const company = param.company;
    const company_address = param.company_address;
    const source_service = param.source_service;
    const project_date = param.project_date;

    const queryStr = "INSERT INTO project (name, company, company_address, source_service, project_date ) VALUES (?, ?, ?, ?, ?)";
    const values = [name, company, company_address, source_service, project_date];

    conn.query(queryStr, values, (err, results) => {
        if (err) {
            console.log(err);
            res.status(500).json({
                "success": false,
                "message": "Failed to add new project",
                "data": null
            });
        } else {
            res.status(200).json({
                "success": true,
                "message": "Successfully added new project",
                "data": results
            });
        }
    });
});

app.post('/api/update-project', function(req, res) {
    const param = req.body;
    const name = param.name;
    const company = param.company;
    const company_address = param.company_address;
    const source_service = param.source_service;
    const project_date = param.project_date;
    const project_id = param.project_id;

    const queryStr = "UPDATE project SET name = ?, company = ?, company_address = ?, source_service = ?, project_date = ? WHERE id = ?";
    const values = [name, company, company_address, source_service, project_date, project_id];

    conn.query(queryStr, values, (err, results) => {
        if (err) {
            console.log(err);
            res.status(500).json({
                "success": false,
                "message": "Failed to update project",
                "data": null
            });
        } else {
            res.status(200).json({
                "success": true,
                "message": "Successfully update project",
                "data": results
            });
        }
    });
});

app.post('/api/delete-project', function(req, res){
    const param = req.body;
    const id = param.id;
    const now = new Date(); 

    const queryStr = "UPDATE project SET deleted_at = ? WHERE id = ?";
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

// ======================== SERVER START =======================
app.get('/', (req, res) => {
    res.send('Hello, world!');
});

app.listen(3000, () => {
    console.log('Server running on http://localhost:3000');
});


