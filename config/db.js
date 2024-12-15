const mysql = require('mysql');
const conn = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'pbl_308'
})

conn.getConnection((err) =>{
    if(err) throw err;
    console.log('DB Connected');
})

module.exports = conn;