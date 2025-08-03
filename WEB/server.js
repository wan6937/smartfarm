const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const http = require('http');
const fs = require('fs');
const WebSocket = require('ws');  
require('dotenv').config();

const app = express();
const port = 3000;

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });  

wss.on('connection', function connection(ws) {
    console.log('New WebSocket connection');
    
    ws.on('message', function incoming(message) {
        console.log('received: %s', message);
    });
    
    ws.on('error', function error(err) {
        console.error('WebSocket error:', err);
    });
});

// CORS 미들웨어 설정 - 모든 출처에서의 요청 허용
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});

app.use(express.json());

// 정적 파일 제공 설정
app.use(express.static(__dirname));

const pool = mysql.createPool({
    host: 'farmsmart.duckdns.org',
    user: 'ljw',
    password: 'ljw',
    database: 'farmsmart',
    port: 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

app.get('/records', (req, res) => {
    res.sendFile(__dirname + '/records.html');
});

app.get('/api/environment', async (req, res) => {
    try {
        const connection = await pool.getConnection();
        
        try {
            // 대기환경 데이터 가져오기
            const [airData] = await connection.query(`
                SELECT time, temperature, humidity, co2 
                FROM airenvtbl 
                ORDER BY time DESC 
                LIMIT 1
            `);
            
            // 수조환경 데이터 가져오기
            const [waterData] = await connection.query(`
                SELECT time, watertemperature as waterTemp, ph, ec
                FROM waterenvtbl 
                ORDER BY time DESC 
                LIMIT 1
            `);
            
            // 두 데이터 합치기
            const combinedData = {
                time: airData.length > 0 ? airData[0].time : null,
                temperature: airData.length > 0 ? airData[0].temperature : null,
                humidity: airData.length > 0 ? airData[0].humidity : null,
                co2: airData.length > 0 ? airData[0].co2 : null,
                waterTemp: waterData.length > 0 ? waterData[0].waterTemp : null,
                ph: waterData.length > 0 ? waterData[0].ph : null,
                ec: waterData.length > 0 ? waterData[0].ec : null
            };
            
            // 응답 보내기
            res.json([combinedData]); // 기존 형식 유지를 위해 배열로 반환
            
        } catch (dbError) {
            console.error('데이터베이스 쿼리 오류:', dbError);
            
            // 테이블이 없거나 쿼리 오류 발생 시 빈 데이터 반환
            res.json([{
                time: new Date(),
                temperature: 0,
                humidity: 0,
                co2: 0,
                waterTemp: 0,
                ph: 0,
                ec: 0
            }]);
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error('Database connection error:', error);
        res.status(500).json({ error: 'Database connection failed' });
    }
});

// 대기환경과 수조환경 데이터 가져오기 엔드포인트
app.get('/api/records', async (req, res) => {
    try {
        // 페이지네이션 설정
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 100;
        const offset = (page - 1) * limit;
        
        // 데이터 유형 (기본값은 대기환경)
        const dataType = req.query.type || 'air';
        
        console.log(`데이터 요청: 유형=${dataType}, 페이지=${page}, 한계=${limit}, 오프셋=${offset}`);
        
        let query, table, fields;
        
        // 데이터 유형에 따라 테이블과 필드 설정
        if (dataType === 'air') {
            table = 'airenvtbl';
            fields = 'time, temperature, humidity, co2';
        } else {
            table = 'waterenvtbl';
            // watertemperature 필드를 temperature로 별칭 지정
            fields = 'time, watertemperature as temperature, ph, ec';
        }
        
        // 쿼리 구성 - time 필드를 timestamp로 별칭
        query = `SELECT ${fields.replace('time', 'time as timestamp')} FROM ${table} ORDER BY time DESC LIMIT ? OFFSET ?`;
        
        console.log('실행할 SQL 쿼리:', query);
        console.log('쿼리 파라미터:', [limit, offset]);
        
        const connection = await pool.getConnection();
        
        try {
            // 테이블이 존재하는지 확인
            const [tables] = await connection.query(
                "SHOW TABLES LIKE ?", 
                [table]
            );
            
            if (tables.length === 0) {
                console.log(`테이블 '${table}'이 존재하지 않습니다.`);
                // 테이블이 없으면 빈 결과 반환
                res.json({
                    records: [],
                    pagination: {
                        total: 0,
                        page,
                        limit
                    }
                });
                return;
            }
            
            // 테이블 구조 확인 (디버깅용)
            const [columns] = await connection.query(
                "SHOW COLUMNS FROM ??", 
                [table]
            );
            
            console.log(`테이블 '${table}'의 구조:`, columns.map(col => col.Field));
            
            // 데이터베이스에 쿼리 실행
            const [records] = await connection.query(query, [limit, offset]);
            
            console.log(`데이터베이스에서 ${records.length}개 레코드 반환됨`);
            
            // 첫 번째 레코드를 로그로 출력 (디버깅용)
            if (records.length > 0) {
                console.log('첫 번째 레코드:', JSON.stringify(records[0]));
            }
            
            // 데이터가 없는 경우 로깅
            if (records.length === 0) {
                console.log(`경고: ${table} 테이블에 데이터가 없습니다.`);
            }
            
            // 총 레코드 수 구하기
            const [countResult] = await connection.query(`SELECT COUNT(*) as total FROM ${table}`);
            const total = countResult[0].total;
            
            console.log(`테이블 ${table}의 총 레코드 수: ${total}`);
            
            // 응답 보내기
            res.json({
                records,
                pagination: {
                    total,
                    page,
                    limit
                }
            });
        } catch (dbError) {
            console.error('데이터베이스 쿼리 오류:', dbError);
            res.json({
                records: [],
                pagination: {
                    total: 0,
                    page,
                    limit
                },
                error: {
                    message: '데이터베이스 쿼리 중 오류가 발생했습니다',
                    details: process.env.NODE_ENV === 'development' ? dbError.message : undefined
                }
            });
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error('API 오류:', error);
        res.status(500).json({ 
            error: '서버 오류가 발생했습니다',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// 서버 시작
server.listen(port, () => {
    console.log(`HTTP Server is running on port ${port}`);
});
