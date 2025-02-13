const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
const axios = require('axios');
const cron = require('node-cron');
require('dotenv').config();

const app = express();
const pool = new Pool({ connectionString: 'postgresql://fpl_betting_db_user:yTPRRJ9PlvdQknaLZZIKAPOdcrdurigF@dpg-cumib12n91rc73dvdtd0-a.oregon-postgres.render.com/fpl_betting_db', ssl: { rejectUnauthorized: false } });
const SECRET_KEY = process.env.JWT_SECRET || 'supersecretkey';
const SPORTS_ODDS_API_KEY = process.env.SPORTS_ODDS_API_KEY;
const SPORTS_ODDS_API_URL = 'https://api.the-odds-api.com/v4/sports/';

app.use(cors());
app.use(bodyParser.json());

// Function to fetch and update NBA and NFL games
async function updateGames() {
    try {
        const response = await axios.get(`${SPORTS_ODDS_API_URL}`, {
            headers: { 'Authorization': `Bearer ${SPORTS_ODDS_API_KEY}` }
        });
        
        if (response.data && response.data.games) {
            for (const game of response.data.games) {
                const tableName = game.league === 'NBA' ? 'nba_games' : 'nfl_games';
                await pool.query(
                    `INSERT INTO ${tableName} (league, home_team, away_team, game_date, moneyline_home, moneyline_away, spread_home, spread_away, spread_value)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                     ON CONFLICT (home_team, away_team, game_date) DO UPDATE 
                     SET moneyline_home = EXCLUDED.moneyline_home, moneyline_away = EXCLUDED.moneyline_away,
                         spread_home = EXCLUDED.spread_home, spread_away = EXCLUDED.spread_away, spread_value = EXCLUDED.spread_value`,
                    [game.league, game.home_team, game.away_team, game.game_date, game.odds.moneyline_home, game.odds.moneyline_away, 
                     game.odds.spread_home, game.odds.spread_away, game.odds.spread_value]
                );
            }
            console.log('Games updated successfully.');
        }
    } catch (error) {
        console.error('Error updating games:', error);
    }
}

// Schedule daily updates at midnight UTC
cron.schedule('0 0 * * *', () => {
    console.log('Running scheduled game update...');
    updateGames();
});

// Manual games update route
app.get('/update-games', async (req, res) => {
    try {
        await updateGames();
        res.json({ message: 'Games updated successfully' });
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
