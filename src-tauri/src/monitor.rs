use crate::sysproc::ProcInfo;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiskInfo {
    pub name: String,
    pub total: u64,
    pub available: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemStats {
    pub cpu: f32,
    pub mem_total: u64,
    pub mem_used: u64,
    pub disks: Vec<DiskInfo>,
    pub net_rx: u64,
    pub net_tx: u64,
}

pub fn snapshot() -> SystemStats {
    let mut sys = sysinfo::System::new_all();
    sys.refresh_cpu_usage();
    let cpu = sys.global_cpu_usage();
    let disks = sysinfo::Disks::new_with_refreshed_list()
        .iter()
        .map(|d| DiskInfo {
            name: d.name().to_string_lossy().to_string(),
            total: d.total_space(),
            available: d.available_space(),
        })
        .collect();
    let (net_rx, net_tx) = sysinfo::Networks::new_with_refreshed_list()
        .iter()
        .fold((0u64, 0u64), |(rx, tx), (_, n)| {
            (rx + n.received(), tx + n.transmitted())
        });
    SystemStats {
        cpu,
        mem_total: sys.total_memory(),
        mem_used: sys.used_memory(),
        disks,
        net_rx,
        net_tx,
    }
}

/// 一次采样：系统快照 + CPU Top5 进程（共用一个 System，省开销）
pub fn sample_with_procs() -> (SystemStats, Vec<ProcInfo>) {
    let mut sys = sysinfo::System::new_all();
    sys.refresh_cpu_usage();
    let cpu = sys.global_cpu_usage();
    let disks = sysinfo::Disks::new_with_refreshed_list()
        .iter()
        .map(|d| DiskInfo {
            name: d.name().to_string_lossy().to_string(),
            total: d.total_space(),
            available: d.available_space(),
        })
        .collect();
    let (net_rx, net_tx) = sysinfo::Networks::new_with_refreshed_list()
        .iter()
        .fold((0u64, 0u64), |(rx, tx), (_, n)| {
            (rx + n.received(), tx + n.transmitted())
        });
    let stats = SystemStats {
        cpu,
        mem_total: sys.total_memory(),
        mem_used: sys.used_memory(),
        disks,
        net_rx,
        net_tx,
    };
    let mut procs: Vec<ProcInfo> = sys
        .processes()
        .iter()
        .map(|(pid, p)| ProcInfo {
            pid: pid.as_u32(),
            name: p.name().to_string_lossy().to_string(),
            cpu: p.cpu_usage(),
            memory: p.memory(),
            user: p.user_id().map(|u| u.to_string()).unwrap_or_default(),
            command: p
                .cmd()
                .iter()
                .map(|s| s.to_string_lossy().to_string())
                .collect::<Vec<_>>()
                .join(" "),
        })
        .collect();
    procs.sort_by(|a, b| b.cpu.partial_cmp(&a.cpu).unwrap_or(std::cmp::Ordering::Equal));
    procs.truncate(5);
    (stats, procs)
}
