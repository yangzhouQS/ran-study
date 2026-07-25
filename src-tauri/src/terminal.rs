use crate::error::{RanError, RanResult};
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use serde::Serialize;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};

pub struct TerminalSession {
    pub writer: Box<dyn Write + Send>,
    pub child: Box<dyn portable_pty::Child + Send + Sync>,
    #[allow(dead_code)]
    pub master: Box<dyn portable_pty::MasterPty + Send>,
}

pub type SessionMap = Mutex<HashMap<String, TerminalSession>>;

#[derive(Clone, Serialize)]
pub struct TerminalOutput {
    pub session_id: String,
    pub data: String,
}

pub fn open(app: AppHandle, cwd: &std::path::Path, map: &SessionMap) -> RanResult<String> {
    let pty = native_pty_system();
    let pair = pty
        .openpty(PtySize {
            rows: 24,
            cols: 80,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| RanError::Other(e.to_string()))?;
    let mut cmd = CommandBuilder::new(if cfg!(windows) {
        "powershell.exe"
    } else {
        "bash"
    });
    cmd.cwd(cwd);
    let child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| RanError::Other(e.to_string()))?;
    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| RanError::Other(e.to_string()))?;
    let writer = pair
        .master
        .take_writer()
        .map_err(|e| RanError::Other(e.to_string()))?;
    let master = pair.master;
    drop(pair.slave);

    let id = uuid::Uuid::new_v4().to_string();
    let app2 = app.clone();
    let id2 = id.clone();
    std::thread::spawn(move || {
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    let data = String::from_utf8_lossy(&buf[..n]).to_string();
                    let _ = app2.emit(
                        "terminal://output",
                        TerminalOutput {
                            session_id: id2.clone(),
                            data,
                        },
                    );
                }
            }
        }
    });

    map.lock()
        .unwrap()
        .insert(id.clone(), TerminalSession { writer, child, master });
    Ok(id)
}

pub fn write(map: &SessionMap, id: &str, data: &str) -> RanResult<()> {
    let mut m = map.lock().unwrap();
    let s = m
        .get_mut(id)
        .ok_or_else(|| RanError::NotFound("terminal session".into()))?;
    s.writer
        .write_all(data.as_bytes())
        .map_err(|e| RanError::Io(e.to_string()))?;
    s.writer
        .flush()
        .map_err(|e| RanError::Io(e.to_string()))?;
    Ok(())
}

pub fn close(map: &SessionMap, id: &str) -> RanResult<()> {
    if let Some(mut s) = map.lock().unwrap().remove(id) {
        let _ = s.child.kill();
        let _ = s.child.wait();
    }
    Ok(())
}
