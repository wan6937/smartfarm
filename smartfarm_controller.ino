
/**
 * 스마트팜 제어 시스템 (통합 버전)
 * 
 * 기능:
 * - SCD41 센서로 온습도, CO2 측정
 * - 탱크 수위 감지 및 모터 제어
 * - MQTT를 통한 실시간 데이터 전송
 * - LED 원격 제어 (어항등, 식물등1, 식물등2)
 * 
 * MQTT 토픽 구조:
 * - FarmSmart/SCDsensor/pub: 온습도, CO2 통합 데이터
 * - FarmSmart/[장치명]/sub: 제어 명령
 * - FarmSmart/[장치명]/status: 장치 상태
 * - FarmSmart/system/status: 시스템 상태
 */

//=============== 라이브러리 ===============//
#include <WiFiS3.h>           // Arduino R4 WiFi 라이브러리
#include <PubSubClient.h>      // MQTT 라이브러리
#include <Wire.h>              // I2C 통신
#include "SparkFun_SCD4x_Arduino_Library.h" // SparkFun SCD41 센서 라이브러리
#include <ArduinoJson.h>       // JSON 라이브러리

//=============== 설정값 정의 ===============//

// 핀 설정
#define B_TANK_SENSOR_PIN 4    // B탱크 수위 센서
#define B_TANK_DOWN_MOTOR 5    // B탱크 배출 모터 (B→A)
#define A_TANK_UP_MOTOR 6     // A탱크 공급 모터 (A→B)
#define PLANT_LED1_PIN 9       // 식물 LED 1 / 릴레이 3번
#define PLANT_LED2_PIN 10      // 백그라운드 LED 2 / 릴레이 2번
#define AQUARIUM_LED_PIN 11    // 어항 LED / 릴레이 1번

// WiFi 설정
const char* WIFI_SSID = "Farm_2.4g";     
const char* WIFI_PASSWORD = "20240603"; 

// MQTT 설정
const char* MQTT_SERVER = "farmsmart.duckdns.org";
const int MQTT_PORT = 1883;

// MQTT 토픽 구조체
struct MQTTTopics {
    // 센서 토픽
    const char* sensor = "FarmSmart/SCDsensor/pub";
    
    // 펌프 제어 토픽
    const char* up_motor_sub = "FarmSmart/upMotor/sub";      // A펌프 수동 제어
    const char* aquariumLight_sub = "FarmSmart/aquariumLight/sub";
    const char* plantLight1_sub = "FarmSmart/plantLight1/sub";
    const char* plantLight2_sub = "FarmSmart/plantLight2/sub";
    
    // LED 상태 토픽
    const char* aquariumLight_status = "FarmSmart/aquariumLight/status";
    const char* plantLight1_status = "FarmSmart/plantLight1/status";
    const char* plantLight2_status = "FarmSmart/plantLight2/status";
    const char* up_motor_status = "FarmSmart/upMotor/status";
    
    // 시스템 상태 토픽
    const char* system_status = "FarmSmart/system/status";
    
    // 상태 요청 토픽
    const char* request = "FarmSmart/request/status";
} MQTT_TOPICS;

// 모터 상태 구조체
struct MotorState {
    bool running = false;
    unsigned long start_time = 0;
    
    // 시간 상수 (밀리초 단위)
    static const unsigned long RUN_TIME_MS = 120000;      // 모터 작동 시간 (120초 = 2분)
    static const unsigned long EMERGENCY_TIME_MS = 90000; // 비상 정지 발동 시간 (90초 = 1분 30초)
};

// 모터 인스턴스 생성
MotorState up_motor;   // A탱크 공급 모터 (A→B)
MotorState down_motor; // B탱크 배출 모터 (B→A) - 상태 모니터링 전용

// LED 상태 배열 [어항등, 식물등1, 식물등2]
bool ledStates[] = {false, false, false};

// LED 깜빡임 제어용 변수
unsigned long lastBlinkTime = 0;
const unsigned long blinkInterval = 2000; // 2초마다 깜빡임

// 시스템 상태 변수
unsigned long lastSensorUpdate = 0;
unsigned long b_tank_full_time = 0;
bool b_tank_full = false;
bool system_normal = true;

// SCD41 센서 객체 (SCD41 타입으로 명시)
SCD4x mySensor(SCD4x_SENSOR_SCD41);

//=============== 객체 초기화 ===============//
WiFiClient wifiClient;
PubSubClient mqttClient(wifiClient);
StaticJsonDocument<200> jsonDoc;

//=============== 함수 선언 ===============//
void setupWiFi();
void setupMQTT();
void setupSensors();
void setupPins();
void handleMQTTConnection();
void publishSensorData();
void publishDeviceState(const char* topic, bool state);
void publishAllStates();
void publishSystemStatus(const char* status);

//=============== MQTT 콜백 함수 ===============//
void mqttCallback(char* topic, byte* payload, unsigned int length) {
    // 수신된 메시지를 문자열로 변환
    char message[50];
    memcpy(message, payload, length);
    message[length] = '\0';
    
    // 상태 요청 메시지 처리
    if (strcmp(topic, MQTT_TOPICS.request) == 0) {
        if (strcmp(message, "all") == 0) {
            publishAllStates();
            return;
        }
    }
    
    // 장치 제어 처리
    if (strcmp(topic, MQTT_TOPICS.aquariumLight_sub) == 0) {
        digitalWrite(AQUARIUM_LED_PIN, strcmp(message, "1") == 0 ? LOW : HIGH);
        ledStates[0] = (strcmp(message, "1") == 0 ? false : true);
        publishDeviceState(MQTT_TOPICS.aquariumLight_status, ledStates[0]);
    }
    else if (strcmp(topic, MQTT_TOPICS.plantLight1_sub) == 0) {
        digitalWrite(PLANT_LED1_PIN, strcmp(message, "1") == 0 ? LOW : HIGH);
        ledStates[1] = (strcmp(message, "1") == 0 ? false : true);
        publishDeviceState(MQTT_TOPICS.plantLight1_status, ledStates[1]);
    }
    else if (strcmp(topic, MQTT_TOPICS.plantLight2_sub) == 0) {
        digitalWrite(PLANT_LED2_PIN, strcmp(message, "1") == 0 ? LOW : HIGH);
        ledStates[2] = (strcmp(message, "1") == 0 ? false : true);
        publishDeviceState(MQTT_TOPICS.plantLight2_status, ledStates[2]);
    }
    else if (strcmp(topic, MQTT_TOPICS.up_motor_sub) == 0) {
        digitalWrite(A_TANK_UP_MOTOR, strcmp(message, "1") == 0 ? HIGH : LOW);
        up_motor.running = (strcmp(message, "1") == 0);
        publishDeviceState(MQTT_TOPICS.up_motor_status, up_motor.running);
    }
}

void publishDeviceState(const char* topic, bool state) {
    // LED 토픽인 경우 반대로 발행 (켜짐=0, 꺼짐=1)
    if (strcmp(topic, MQTT_TOPICS.aquariumLight_status) == 0 ||
        strcmp(topic, MQTT_TOPICS.plantLight1_status) == 0 ||
        strcmp(topic, MQTT_TOPICS.plantLight2_status) == 0) {
        mqttClient.publish(topic, state ? "0" : "1");
    }
    // 모터 토픽인 경우 기존대로 발행 (켜짐=1, 꺼짐=0)
    else {
        mqttClient.publish(topic, state ? "1" : "0");
    }
}

void publishAllStates() {
    // 디바이스 상태 발행
    publishDeviceState(MQTT_TOPICS.aquariumLight_status, ledStates[0]);
    publishDeviceState(MQTT_TOPICS.plantLight1_status, ledStates[1]);
    publishDeviceState(MQTT_TOPICS.plantLight2_status, ledStates[2]);
    publishDeviceState(MQTT_TOPICS.up_motor_status, up_motor.running);
}

void publishSystemStatus(const char* status) {
    // JSON 형식으로 메시지 생성
    String jsonMessage = "{\"status\":\"" + String(status) + "\",\"timestamp\":" + String(millis()) + "}";
    
    // MQTT로 발행
    mqttClient.publish(MQTT_TOPICS.system_status, jsonMessage.c_str());
    
    Serial.print("시스템 상태 발행: ");
    Serial.println(jsonMessage);
}

//=============== 초기 설정 ===============//
void setup() {
    Serial.begin(115200);
    while (!Serial) delay(10);
    
    Serial.println("\n=== 스마트팜 제어 시스템 시작 ===\n");
    
    setupPins();
    setupWiFi();
    setupMQTT();
    setupSensors();
    
    // 시스템 시작 시 UP 모터 작동
    digitalWrite(A_TANK_UP_MOTOR, HIGH);
    up_motor.running = true;
    publishDeviceState(MQTT_TOPICS.up_motor_status, up_motor.running);
}

//=============== 메인 루프 ===============//
void loop() {
    if (!mqttClient.connected()) {
        handleMQTTConnection();
    }
    mqttClient.loop();

    // 센서 데이터 발행 (5초마다)
    static unsigned long lastSensorPublish = 0;
    if (millis() - lastSensorPublish >= 5000) {
        publishSensorData();
        lastSensorPublish = millis();
    }

    // 현재 상태 확인
    unsigned long current_time = millis();
    bool sensor_high = (digitalRead(B_TANK_SENSOR_PIN) == HIGH);  // 센서 HIGH 신호 감지
    
    // 비상 정지 상태에서 센서가 LOW면 시스템 복구
    if (!system_normal && !sensor_high) {
        systemRecovery();
        Serial.println("✅ 센서 LOW 감지 - 시스템 정상 복구");
        return;
    }
    
    // 비상 정지 상태면 모든 동작 중단
    if (!system_normal) {
        if (up_motor.running) stopUpMotor();
        if (down_motor.running) stopDownMotor();
        
        // LED 1 깜빡임 처리 (2초마다)
        unsigned long currentMillis = millis();
        if (currentMillis - lastBlinkTime >= blinkInterval) {
            lastBlinkTime = currentMillis;
            ledStates[1] = !ledStates[1]; // LED 1 상태 토글
            digitalWrite(PLANT_LED1_PIN, ledStates[1] ? LOW : HIGH);
            publishDeviceState(MQTT_TOPICS.plantLight1_status, ledStates[1]);
        }
        return;
    }
    
    // 센서 신호에 따른 모터 제어
    if (sensor_high) {
        if (!down_motor.running) {
            // HIGH 신호 최초 감지시 타이머 시작
            b_tank_full_time = current_time;
            startDownMotor();
            Serial.println("💧 센서 HIGH 신호 감지 - B모터 작동 시작 (2분)");
        } 
        // 모터 작동 후 지정된 시간 동안 LOW 신호가 안오면 비상 정지
        else if (current_time - b_tank_full_time >= MotorState::EMERGENCY_TIME_MS) {
            systemEmergencyStop("⚠️ B모터 작동 실패! - 비상 정지 시간 초과 (LOW 신호 없음)");
        }
    }
    
    // B모터 작동 시간 경과 후 자동 정지
    if (down_motor.running && current_time - down_motor.start_time >= MotorState::RUN_TIME_MS) {
        stopDownMotor();
        Serial.println("⏳ B모터 2분 작동 완료");
    }
}

//=============== 유틸리티 함수들 ===============//

void setupPins() {
    pinMode(B_TANK_SENSOR_PIN, INPUT_PULLUP);
    pinMode(B_TANK_DOWN_MOTOR, OUTPUT);
    pinMode(A_TANK_UP_MOTOR, OUTPUT);
    pinMode(PLANT_LED1_PIN, OUTPUT);
    pinMode(PLANT_LED2_PIN, OUTPUT);
    pinMode(AQUARIUM_LED_PIN, OUTPUT);
    // 초기 상태 설정
    digitalWrite(B_TANK_DOWN_MOTOR, LOW);
    digitalWrite(A_TANK_UP_MOTOR, LOW);
    digitalWrite(PLANT_LED1_PIN, LOW);
    digitalWrite(PLANT_LED2_PIN, LOW);
    digitalWrite(AQUARIUM_LED_PIN, LOW);
}

void setupWiFi() {
    Serial.print("WiFi 연결 중... ");
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    
    while (WiFi.status() != WL_CONNECTED) {
        delay(500);
        Serial.print(".");
    }
    
    Serial.println("\n✅ WiFi 연결됨");
    Serial.print("IP 주소: ");
    Serial.println(WiFi.localIP());
}

void setupMQTT() {
    Serial.println("\nMQTT 브로커 연결 설정...");
    mqttClient.setServer(MQTT_SERVER, MQTT_PORT);
    mqttClient.setCallback(mqttCallback);
}

void setupSensors() {
    Wire.begin();
    delay(1000); // 센서 안정화 대기
    
    Serial.println("\nSCD41 센서 초기화 중...");
    
    // 디버깅 활성화
    mySensor.enableDebugging(Serial);
    
    // 센서 초기화 (자동 보정 비활성화)
    if (!mySensor.begin(true, false)) {
        Serial.println("❌ SCD41 센서 연결 실패!");
        Serial.println("다음을 확인해주세요:");
        Serial.println("1. I2C 연결 (SDA=18, SCL=19)");
        Serial.println("2. 전원 연결 (3.3V, GND)");
        Serial.println("3. 센서 주소 (0x62)");
        
        while (1) {
            delay(1000);
            Serial.print(".");
        }
    }
    
    Serial.println("✅ SCD41 센서 연결 완료");
    
    // 센서 설정
    mySensor.stopPeriodicMeasurement();
    delay(500);
    
    // 온도 오프셋 설정 (필요한 경우)
    mySensor.setTemperatureOffset(4.0); // 기본값 4.0
    
    // 고도 설정 (해수면 기준, 미터 단위)
    mySensor.setSensorAltitude(0);
    
    // 주기적 측정 시작
    if (mySensor.startPeriodicMeasurement()) {
        Serial.println("✅ 주기적 측정 시작");
    } else {
        Serial.println("❌ 주기적 측정 시작 실패");
    }
}

void handleMQTTConnection() {
    while (!mqttClient.connected()) {
        Serial.print("MQTT 연결 시도 중... ");
        
        if (mqttClient.connect("ArduinoClient")) {
            Serial.println("연결 성공!");
            
            // 토픽 구독
            mqttClient.subscribe(MQTT_TOPICS.up_motor_sub);
            mqttClient.subscribe(MQTT_TOPICS.aquariumLight_sub);
            mqttClient.subscribe(MQTT_TOPICS.plantLight1_sub);
            mqttClient.subscribe(MQTT_TOPICS.plantLight2_sub);
            mqttClient.subscribe(MQTT_TOPICS.request);
            
            // 초기 상태 발행
            publishAllStates();
        } else {
            Serial.println("실패, 5초 후 재시도...");
            delay(5000);
        }
    }
}

void publishSensorData() {
    static unsigned long lastResetAttempt = 0;
    static int failCount = 0;
    
    if (mySensor.readMeasurement()) {  // true = 새로운 데이터 있음
        float temp = mySensor.getTemperature();
        float hum = mySensor.getHumidity();
        uint16_t co2 = mySensor.getCO2();
        
        // 유효한 데이터인지 확인 (모든 값이 0이면 의심)
        if (temp == 0.0 && hum == 0.0 && co2 == 0) {
            Serial.println("⚠️ 모든 센서 값이 0입니다. 데이터가 의심스럽습니다.");
            failCount++;
        } else {
            // 유효한 데이터를 받았으므로 실패 카운트 초기화
            failCount = 0;
            
            // 시리얼 모니터에 출력
            Serial.println("\n=== 센서 데이터 ===");
            Serial.print("온도: "); Serial.print(temp); Serial.println(" °C");
            Serial.print("습도: "); Serial.print(hum); Serial.println(" %");
            Serial.print("CO2: "); Serial.print(co2); Serial.println(" ppm");
            
            // JSON 문서 생성
            jsonDoc.clear();
            jsonDoc["temperature"] = temp;
            jsonDoc["humidity"] = hum;
            jsonDoc["co2"] = co2;
    
            // JSON 문자열로 변환
            char jsonBuffer[128];
            serializeJson(jsonDoc, jsonBuffer);
    
            // MQTT로 발행
            if (mqttClient.publish(MQTT_TOPICS.sensor, jsonBuffer)) {
                Serial.println("✅ MQTT 센서 데이터 발행 성공");
            } else {
                Serial.println("❌ MQTT 센서 데이터 발행 실패");
            }
        }
    } else {
        Serial.println("❌ 센서 데이터 읽기 실패");
        failCount++;
    }
    
    // 연속 3회 이상 실패하고 마지막 재시작 시도 후 30초가 지났으면 센서 재시작
    if (failCount >= 3 && (millis() - lastResetAttempt >= 30000)) {
        Serial.println("⚠️ 센서 연속 실패! 센서 재시작 시도...");
        
        // I2C 버스 리셋 시도
        Serial.println("I2C 버스 리셋 중...");
        Wire.end();
        delay(100);
        Wire.begin();
        delay(100);
        
        // 센서 완전 초기화
        Serial.println("센서 완전 초기화 중...");
        
        // 센서 객체 재초기화
        bool success = mySensor.begin(true, false);
        
        if (success) {
            Serial.println("✅ 센서 초기화 성공");
            
            // 센서 설정
            delay(500);
            
            // 온도 오프셋 설정
            if (mySensor.setTemperatureOffset(4.0)) {
                Serial.println("✅ 온도 오프셋 설정 성공");
            } else {
                Serial.println("❌ 온도 오프셋 설정 실패");
            }
            
            // 고도 설정
            if (mySensor.setSensorAltitude(0)) {
                Serial.println("✅ 고도 설정 성공");
            } else {
                Serial.println("❌ 고도 설정 실패");
            }
            
            // 주기적 측정 시작
            if (mySensor.startPeriodicMeasurement()) {
                Serial.println("✅ 주기적 측정 시작 성공");
            } else {
                Serial.println("❌ 주기적 측정 시작 실패");
            }
        } else {
            Serial.println("❌ 센서 초기화 실패");
        }
        
        lastResetAttempt = millis();
        failCount = 0;
    }
}

// 모터 제어 함수
void startUpMotor() {
    Serial.println("UP 모터 켜기 시도 - 핀 상태 변경 전: " + String(digitalRead(A_TANK_UP_MOTOR)));
    digitalWrite(A_TANK_UP_MOTOR, HIGH);
    Serial.println("UP 모터 켜기 시도 - 핀 상태 변경 후: " + String(digitalRead(A_TANK_UP_MOTOR)));
    up_motor.running = true;
    up_motor.start_time = millis();
    publishDeviceState(MQTT_TOPICS.up_motor_status, up_motor.running);
    Serial.println("UP 모터 상태: " + String(up_motor.running ? "ON" : "OFF"));
}

void stopUpMotor() {
    Serial.println("UP 모터 끄기 시도 - 핀 상태 변경 전: " + String(digitalRead(A_TANK_UP_MOTOR)));
    digitalWrite(A_TANK_UP_MOTOR, LOW);
    Serial.println("UP 모터 끄기 시도 - 핀 상태 변경 후: " + String(digitalRead(A_TANK_UP_MOTOR)));
    up_motor.running = false;
    publishDeviceState(MQTT_TOPICS.up_motor_status, up_motor.running);
    Serial.println("UP 모터 상태: " + String(up_motor.running ? "ON" : "OFF"));
}

void startDownMotor() {
    digitalWrite(B_TANK_DOWN_MOTOR, HIGH);
    down_motor.running = true;
    down_motor.start_time = millis();
    Serial.println("DOWN 모터 상태: " + String(down_motor.running ? "ON" : "OFF"));
}

void stopDownMotor() {
    digitalWrite(B_TANK_DOWN_MOTOR, LOW);
    down_motor.running = false;
    Serial.println("DOWN 모터 상태: " + String(down_motor.running ? "ON" : "OFF"));
}

void systemEmergencyStop(const char* message) {
    system_normal = false;
    stopUpMotor();
    
    // 모터 상태 발행
    publishDeviceState(MQTT_TOPICS.up_motor_status, up_motor.running);
    
    // Emergency 상태 발행
    publishSystemStatus("emergency");
    
    // LED 1 깜빡임 초기화
    lastBlinkTime = millis();
    
    Serial.print("⚠️ 시스템 비상 정지: ");
    Serial.println(message);
}

/**
 * 시스템 복구 함수
 * 비상 정지 상태에서 정상 상태로 복구
 */
void systemRecovery() {
    system_normal = true;
    
    // Recovery 상태 발행
    publishSystemStatus("recovery");
    
    // LED 1 상태 초기화 (꺼짐)
    ledStates[1] = false;
    digitalWrite(PLANT_LED1_PIN, HIGH);
    publishDeviceState(MQTT_TOPICS.plantLight1_status, ledStates[1]);
    
    Serial.println("✅ 시스템 복구 완료");
}
