const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
const pool = new Pool({ connectionString: 'postgresql://fpl_betting_db_user:yTPRRJ9PlvdQknaLZZIKAPOdcrdurigF@dpg-cumib12n91rc73dvdtd0-a.oregon-postgres.render.com/fpl_betting_db', ssl: { rejectUnauthorized: false } });
const SECRET_KEY = process.env.JWT_SECRET || 'supersecretkey';

app.use(cors());
app.use(bodyParser.json());

// User Registration
app.post('/register', async (req, res) => {
    const { username, email, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    try {
        const result = await pool.query(
            'INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id, username',
            [username, email, hashedPassword]
        );
        res.status(201).json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// User Login
app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const user = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (user.rows.length === 0) return res.status(400).json({ error: 'Invalid email or password' });
        
        const isValid = await bcrypt.compare(password, user.rows[0].password_hash);
        if (!isValid) return res.status(400).json({ error: 'Invalid email or password' });
        
        const token = jwt.sign({ id: user.rows[0].id, username: user.rows[0].username }, SECRET_KEY, { expiresIn: '7d' });
        res.json({ token });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Fetch NBA and NFL Games
app.get('/games', async (req, res) => {
    try {
        const nbaGames = await pool.query('SELECT * FROM nba_games WHERE game_date >= NOW() ORDER BY game_date ASC');
        const nflGames = await pool.query('SELECT * FROM nfl_games WHERE game_date >= NOW() ORDER BY game_date ASC');
        res.json({ nba: nbaGames.rows, nfl: nflGames.rows });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
