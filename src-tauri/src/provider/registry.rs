use super::SoftwareProvider;
use std::collections::HashMap;
use std::sync::Arc;

pub struct ProviderRegistry {
    providers: HashMap<String, Arc<dyn SoftwareProvider>>,
}

impl ProviderRegistry {
    pub fn new() -> Self {
        Self {
            providers: HashMap::new(),
        }
    }
    pub fn register(&mut self, p: Arc<dyn SoftwareProvider>) {
        self.providers.insert(p.id().to_string(), p);
    }
    pub fn list(&self) -> Vec<&Arc<dyn SoftwareProvider>> {
        self.providers.values().collect()
    }
}

impl Default for ProviderRegistry {
    fn default() -> Self {
        Self::new()
    }
}
