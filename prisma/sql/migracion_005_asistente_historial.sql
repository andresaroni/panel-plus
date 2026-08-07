CREATE TABLE IF NOT EXISTS panel_ai_conversations (
    id_conversacion BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    usuario_id INT UNSIGNED NOT NULL,
    titulo VARCHAR(120) NOT NULL,
    date_create DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    date_update DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id_conversacion),
    KEY idx_ai_conversation_usuario (usuario_id, date_update),
    CONSTRAINT fk_ai_conversation_usuario
        FOREIGN KEY (usuario_id) REFERENCES usuarios (id_usuario) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS panel_ai_messages (
    id_mensaje BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    conversacion_id BIGINT UNSIGNED NOT NULL,
    rol ENUM('user', 'assistant') NOT NULL,
    contenido TEXT NOT NULL,
    date_create DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id_mensaje),
    KEY idx_ai_message_conversation (conversacion_id, id_mensaje),
    CONSTRAINT fk_ai_message_conversation
        FOREIGN KEY (conversacion_id) REFERENCES panel_ai_conversations (id_conversacion) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
