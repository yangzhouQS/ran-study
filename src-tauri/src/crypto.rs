/// 简易加密：基于 Windows 机器 GUID 的 XOR + hex 编码
/// 防止 ran.db 被直接复制后明文读取密码（非高强度加密，适合本地工具场景）

use std::process::Command;

fn machine_guid() -> String {
    #[cfg(windows)]
    {
        Command::new("reg")
            .args(["query", "HKLM\\SOFTWARE\\Microsoft\\Cryptography", "/v", "MachineGuid"])
            .output()
            .ok()
            .and_then(|o| String::from_utf8(o.stdout).ok())
            .and_then(|s| {
                s.lines()
                    .find(|l| l.contains("MachineGuid"))
                    .and_then(|l| l.split_whitespace().last().map(String::from))
            })
            .unwrap_or_else(|| "ran-study-fallback-key-2026".into())
    }
    #[cfg(not(windows))]
    {
        "ran-study-fallback-key-2026".into()
    }
}

/// 加密密码 → hex 字符串
pub fn encrypt(plain: &str) -> String {
    if plain.is_empty() {
        return String::new();
    }
    let key = machine_guid();
    let key_bytes = key.as_bytes();
    let encrypted: Vec<u8> = plain
        .as_bytes()
        .iter()
        .enumerate()
        .map(|(i, b)| b ^ key_bytes[i % key_bytes.len()])
        .collect();
    encrypted.iter().map(|b| format!("{:02x}", b)).collect()
}

/// 解密 hex 字符串 → 明文
pub fn decrypt(cipher_hex: &str) -> String {
    if cipher_hex.is_empty() {
        return String::new();
    }
    let key = machine_guid();
    let key_bytes = key.as_bytes();
    let bytes: Vec<u8> = (0..cipher_hex.len())
        .step_by(2)
        .filter_map(|i| u8::from_str_radix(&cipher_hex[i..i + 2], 16).ok())
        .collect();
    let decrypted: Vec<u8> = bytes
        .iter()
        .enumerate()
        .map(|(i, b)| b ^ key_bytes[i % key_bytes.len()])
        .collect();
    String::from_utf8_lossy(&decrypted).to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encrypt_decrypt_roundtrip() {
        let pw = "MySecret123!@#";
        let enc = encrypt(pw);
        assert_ne!(pw, enc);
        let dec = decrypt(&enc);
        assert_eq!(pw, dec);
    }

    #[test]
    fn empty_stays_empty() {
        assert_eq!(encrypt(""), "");
        assert_eq!(decrypt(""), "");
    }
}
