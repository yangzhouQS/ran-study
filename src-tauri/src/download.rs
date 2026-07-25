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
}
