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

// Function to clear previous week's games before updating
async function purgeOldGames() {
    try {
        console.log("Purging old games...");
        await pool.query("DELETE FROM nba_games WHERE game_date < date_trunc('week', NOW())");
        await pool.query("DELETE FROM nfl_games WHERE game_date < date_trunc('week', NOW())");
        await pool.query("DELETE FROM user_selections WHERE created_at < date_trunc('week', NOW())");
        console.log("Old games and selections purged successfully.");
    } catch (error) {
        console.error("Error purging old games:", error);
    }
}

// Function to fetch and update NBA and NFL games
async function updateGames() {
    await purgeOldGames(); // Ensure purge happens before every update
    try {
        console.log("Fetching games from API...");
        
        const leagues = ['basketball_nba', 'americanfootball_nfl'];
        
        for (const league of leagues) {
            const response = await axios.get(`${SPORTS_ODDS_API_URL}${league}/odds/?apiKey=${SPORTS_ODDS_API_KEY}&regions=us&markets=spreads,h2h&oddsFormat=decimal`);
            
            if (response.data && response.data.length > 0) {
                for (const game of response.data) {
                    const tableName = league === 'basketball_nba' ? 'nba_games' : 'nfl_games';
                    
                    await pool.query(
                        `INSERT INTO ${tableName} (league, home_team, away_team, game_date, moneyline_home, moneyline_away, spread_home, spread_away, spread_value)
                         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                         ON CONFLICT (home_team, away_team, game_date) DO UPDATE 
                         SET moneyline_home = EXCLUDED.moneyline_home, moneyline_away = EXCLUDED.moneyline_away,
                             spread_home = EXCLUDED.spread_home, spread_away = EXCLUDED.spread_away, spread_value = EXCLUDED.spread_value`,
                        [league.toUpperCase(), game.home_team, game.away_team, game.commence_time, 
                         game.bookmakers[0]?.markets[1]?.outcomes[0]?.price || null, 
                         game.bookmakers[0]?.markets[1]?.outcomes[1]?.price || null, 
                         game.bookmakers[0]?.markets[0]?.outcomes[0]?.point || null, 
                         game.bookmakers[0]?.markets[0]?.outcomes[1]?.point || null, 
                         game.bookmakers[0]?.markets[0]?.outcomes[0]?.price || null]
                    );
                }
            }
        }
        console.log('Games updated successfully.');
    } catch (error) {
        console.error('Error updating games:', error);
    }
}

// Schedule weekly purge and daily updates at 4 AM ET
cron.schedule('0 4 * * 0', async () => { // Runs every Sunday at 4 AM ET
    console.log('Running scheduled weekly purge...');
    await purgeOldGames();
});

cron.schedule('0 4 * * *', () => { // Runs daily at 4 AM ET
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

// User selection route
app.post('/select-game', async (req, res) => {
    const { user_id, game_id, league } = req.body;
    try {
        // Ensure the user has not already made a pick for the week
        const existingPick = await pool.query(
            "SELECT * FROM user_selections WHERE user_id = $1 AND created_at >= date_trunc('week', NOW())",
            [user_id]
        );
        
        if (existingPick.rows.length > 0) {
            return res.status(400).json({ error: "You have already made a pick for this week." });
        }
        
        // Insert the new pick
        await pool.query(
            "INSERT INTO user_selections (user_id, game_id, league, created_at) VALUES ($1, $2, $3, NOW())",
            [user_id, game_id, league]
        );
        res.json({ message: "Game selection successful!" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Fetch all user selections for the week
app.get('/selections', async (req, res) => {
    try {
        const selections = await pool.query(
            "SELECT * FROM user_selections WHERE created_at >= date_trunc('week', NOW())"
        );
        res.json(selections.rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
