use crate::error::{RanError, RanResult};
use futures_util::StreamExt;
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use tokio::io::AsyncWriteExt;

/// 下载文件到目标路径；progress 回调按累计/总字节触发
pub async fn download(
    url: &str,
    dest: &Path,
    mut progress: impl FnMut(u64, u64) + Send + 'static,
    total_hint: u64,
) -> RanResult<u64> {
    let client = reqwest::Client::builder()
        .build()
        .map_err(|e| RanError::Other(e.to_string()))?;
    let resp = client
        .get(url)
        .send()
        .await
        .map_err(|e| RanError::Other(e.to_string()))?;
    if !resp.status().is_success() {
        return Err(RanError::Other(format!("http {}", resp.status())));
    }
    let total = total_hint.max(resp.content_length().unwrap_or(0));
    let mut stream = resp.bytes_stream();
    let mut file = tokio::fs::File::create(dest)
        .await
        .map_err(|e| RanError::Io(e.to_string()))?;
    let mut written: u64 = 0;
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| RanError::Other(e.to_string()))?;
        file.write_all(&chunk)
            .await
            .map_err(|e| RanError::Io(e.to_string()))?;
        written += chunk.len() as u64;
        progress(written, total);
    }
    Ok(written)
}

/// 计算文件 sha256（小写 hex）
pub fn sha256_file(path: &Path) -> RanResult<String> {
    let bytes = std::fs::read(path)?;
    let mut hasher = Sha256::new();
    hasher.update(&bytes);
    Ok(format!("{:x}", hasher.finalize()))
}

/// 解压 zip 到目标目录
pub fn extract_zip(archive: &Path, dest: &Path) -> RanResult<PathBuf> {
    let file = std::fs::File::open(archive)?;
    let mut za = zip::ZipArchive::new(file).map_err(|e| RanError::Other(e.to_string()))?;
    std::fs::create_dir_all(dest)?;
    for i in 0..za.len() {
        let mut entry = za.by_index(i).map_err(|e| RanError::Other(e.to_string()))?;
        let Some(enclosed) = entry.enclosed_name() else {
            continue;
        };
        let outpath = dest.join(enclosed);
        if entry.is_dir() {
            std::fs::create_dir_all(&outpath)?;
        } else {
            if let Some(parent) = outpath.parent() {
                std::fs::create_dir_all(parent)?;
            }
            let mut outfile = std::fs::File::create(&outpath)?;
            std::io::copy(&mut entry, &mut outfile)?;
        }
    }
    Ok(dest.to_path_buf())
}

/// 解压 zip 并「展平单一顶层目录」后放入 final_dir：
/// 若压缩包内仅一个顶层目录（如 mysql-8.0.36-winx64），则把其内容直接放到 final_dir；
/// 若顶层是多个文件（如 Redis 直接放 redis-server.exe），则原样放入。
pub fn install_from_zip(archive: &Path, final_dir: &Path) -> RanResult<()> {
    let tmp = tempfile::tempdir()?;
    extract_zip(archive, tmp.path())?;
    let entries: Vec<std::fs::DirEntry> =
        std::fs::read_dir(tmp.path())?.collect::<Result<_, _>>()?;
    let src = if entries.len() == 1 && entries[0].path().is_dir() {
        entries[0].path()
    } else {
        tmp.path().to_path_buf()
    };
    std::fs::create_dir_all(final_dir)?;
    move_dir_contents(&src, final_dir)?;
    Ok(())
}

fn move_dir_contents(src: &Path, dest: &Path) -> RanResult<()> {
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let from = entry.path();
        let to = dest.join(entry.file_name());
        if std::fs::rename(&from, &to).is_err() {
            if entry.path().is_dir() {
                copy_dir_recursive(&from, &to)?;
                std::fs::remove_dir_all(&from)?;
            } else {
                std::fs::copy(&from, &to)?;
                std::fs::remove_file(&from)?;
            }
        }
    }
    Ok(())
}

fn copy_dir_recursive(src: &Path, dest: &Path) -> RanResult<()> {
    std::fs::create_dir_all(dest)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let to = dest.join(entry.file_name());
        if entry.path().is_dir() {
            copy_dir_recursive(&entry.path(), &to)?;
        } else {
            std::fs::copy(entry.path(), to)?;
        }
    }
    Ok(())
}

/// 探测端口是否被监听（用于运行状态判断，跨重启有效）
pub fn port_open(host: &str, port: u16) -> bool {
    use std::net::{TcpStream, ToSocketAddrs};
    use std::time::Duration as StdDuration;
    let addr = format!("{host}:{port}");
    let Ok(mut it) = addr.to_socket_addrs() else {
        return false;
    };
    it.next()
        .map(|a| TcpStream::connect_timeout(&a, StdDuration::from_millis(500)).is_ok())
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn sha256_matches_known_value() {
        let tmp = tempfile::tempdir().unwrap();
        let f = tmp.path().join("a.txt");
        let mut h = std::fs::File::create(&f).unwrap();
        h.write_all(b"abc").unwrap();
        assert_eq!(
            sha256_file(&f).unwrap(),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    }

    #[test]
    fn install_from_zip_flatten_single_root() {
        let tmp = tempfile::tempdir().unwrap();
        let zip_path = tmp.path().join("a.zip");
        make_zip_single_top(&zip_path);
        let out = tmp.path().join("out");
        install_from_zip(&zip_path, &out).unwrap();
        assert!(out.join("bin").exists(), "bin dir should be flattened to out/");
        assert!(out.join("bin").join("run.txt").exists());
    }

    #[test]
    fn install_from_zip_multi_files_no_flatten() {
        let tmp = tempfile::tempdir().unwrap();
        let zip_path = tmp.path().join("b.zip");
        make_zip_multi_files(&zip_path);
        let out = tmp.path().join("out2");
        install_from_zip(&zip_path, &out).unwrap();
        assert!(out.join("redis-server.exe").exists());
    }

    fn make_zip_single_top(path: &Path) {
        use std::io::Write;
        let f = std::fs::File::create(path).unwrap();
        let mut zip = zip::ZipWriter::new(f);
        let opt = zip::write::SimpleFileOptions::default();
        zip.add_directory("pkg-1.0/bin/", opt).unwrap();
        let mut w = std::io::Cursor::new(Vec::new());
        write!(&mut w, "run").unwrap();
        zip.start_file("pkg-1.0/bin/run.txt", opt).unwrap();
        std::io::copy(&mut w, &mut zip).unwrap();
        zip.finish().unwrap();
    }

    fn make_zip_multi_files(path: &Path) {
        let f = std::fs::File::create(path).unwrap();
        let mut zip = zip::ZipWriter::new(f);
        let opt = zip::write::SimpleFileOptions::default();
        zip.start_file("redis-server.exe", opt).unwrap();
        std::io::copy(&mut std::io::Cursor::new(b"bin".to_vec()), &mut zip).unwrap();
        zip.start_file("redis-cli.exe", opt).unwrap();
        std::io::copy(&mut std::io::Cursor::new(b"cli".to_vec()), &mut zip).unwrap();
        zip.finish().unwrap();
    }
}
