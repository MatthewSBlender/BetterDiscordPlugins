/**
 * @name EnhancedDM
 * @author MatthewBlender
 * @description Custom Ringtones & Sounds. v33.0 Uses Base64 Data Import (Bypasses all Path/Sandbox issues).
 * @version 33.0.0
 */

module.exports = class EnhancedDM {
    
    getName() { return "EnhancedDM"; }
    getAuthor() { return "MatthewBlender"; }
    getDescription() { return "Assign custom sounds. Uses Base64 embedding to bypass Linux/Flatpak restrictions."; }
    getVersion() { return "33.0.0"; }

    constructor(meta) {
        this.meta = meta;
        this.friendSettings = {}; 
        this.globalSettings = { volume: 1.0, message: null, call: null };
        
        this._UserStore = null;
        this._ChannelStore = null;
        this._RelationshipStore = null;
        this._Dispatcher = null;
    }

    // --- MODULE LOADING ---
    loadModules() {
        if (BdApi.Webpack && BdApi.Webpack.getStore) {
            this._UserStore = BdApi.Webpack.getStore("UserStore");
            this._ChannelStore = BdApi.Webpack.getStore("ChannelStore");
            this._RelationshipStore = BdApi.Webpack.getStore("RelationshipStore");
        }

        const safeFind = (filter) => {
            try {
                if (BdApi.Webpack && BdApi.Webpack.getModule) {
                    return BdApi.Webpack.getModule(filter, { first: true, searchExports: true });
                }
                return BdApi.findModule(filter);
            } catch (err) { return null; }
        };

        this._Dispatcher = safeFind(m => m.dispatch && m.subscribe && !m.getStore);
    }

    start() {
        console.log(`[EnhancedDM] Starting v33...`);
        this.loadModules();

        this.friendSettings = BdApi.Data.load("EnhancedDM", "friendSettings") || {};
        this.globalSettings = BdApi.Data.load("EnhancedDM", "globalSettings") || { volume: 1.0, message: null, call: null };

        if (this._Dispatcher) {
            this._Dispatcher.subscribe("MESSAGE_CREATE", this.handleMessage);
            this._Dispatcher.subscribe("CALL_CREATE", this.handleCall);
            BdApi.UI.showToast("EnhancedDM Active", {type: "success"});
        } else {
            BdApi.UI.showToast("EnhancedDM: Dispatcher Missing", {type: "error"});
        }
    }

    stop() {
        if (this._Dispatcher) {
            this._Dispatcher.unsubscribe("MESSAGE_CREATE", this.handleMessage);
            this._Dispatcher.unsubscribe("CALL_CREATE", this.handleCall);
        }
    }

    // --- SOUND LOGIC ---
    handleMessage = (e) => {
        if (!this._UserStore || !this._ChannelStore) return;
        if (!e.message || !e.message.author) return;

        const currentUser = this._UserStore.getCurrentUser();
        if (currentUser && e.message.author.id === currentUser.id) return;

        const channel = this._ChannelStore.getChannel(e.channelId);
        if (!channel || channel.type !== 1) return; 

        const authorId = e.message.author.id;
        const config = this.friendSettings[authorId];

        if (config && config.message) {
            this.playSound(config.message, config.volume || this.globalSettings.volume);
        } else if (this.globalSettings.message) {
            this.playSound(this.globalSettings.message, this.globalSettings.volume);
        }
    };

    handleCall = (e) => {
        if (!this._UserStore || !this._ChannelStore) return;

        const channel = this._ChannelStore.getChannel(e.channelId);
        if (!channel || channel.type !== 1) return;

        const callerId = channel.recipients[0];
        const currentUser = this._UserStore.getCurrentUser();
        
        if (currentUser && e.ringing && e.ringing.includes(currentUser.id)) {
            const config = this.friendSettings[callerId];
            if (config && config.call) {
                this.playSound(config.call, config.volume || this.globalSettings.volume);
            } else if (this.globalSettings.call) {
                this.playSound(this.globalSettings.call, this.globalSettings.volume);
            }
        }
    };

    playSound(source, volume = 1.0) {
        try {
            // Source can be a URL or a huge Base64 string. Audio() handles both.
            const audio = new Audio(source);
            audio.volume = Math.min(Math.max(volume, 0), 1);
            audio.play();
        } catch (err) { console.error(`[EnhancedDM] Sound Error:`, err); }
    }

    saveData() {
        BdApi.Data.save("EnhancedDM", "friendSettings", this.friendSettings);
        BdApi.Data.save("EnhancedDM", "globalSettings", this.globalSettings);
    }

    // --- SETTINGS PANEL ---
    getSettingsPanel() {
        return () => {
            const [global, setGlobal] = BdApi.React.useState(this.globalSettings);
            const [friends, setFriends] = BdApi.React.useState(this.friendSettings);
            const [selectedId, setSelectedId] = BdApi.React.useState("");
            
            // --- Helper: File Reader ---
            const handleFileSelect = (file, callback) => {
                if (!file) return;
                // Limit size to 2MB to prevent config bloat
                if (file.size > 2000000) {
                    BdApi.UI.showToast("File too large! Max 2MB.", {type: "error"});
                    return;
                }
                const reader = new FileReader();
                reader.onload = (e) => {
                    const result = e.target.result; // This is the data:audio... string
                    callback(result);
                    BdApi.UI.showToast("Sound imported successfully!", {type: "success"});
                };
                reader.onerror = () => BdApi.UI.showToast("Failed to read file.", {type: "error"});
                reader.readAsDataURL(file);
            };

            // Friend List
            let friendList = [];
            if (this._RelationshipStore && this._UserStore) {
                try {
                    let ids = [];
                    if (typeof this._RelationshipStore.getFriendIDs === "function") {
                        ids = this._RelationshipStore.getFriendIDs();
                    } else if (typeof this._RelationshipStore.getRelationships === "function") {
                        ids = Object.keys(this._RelationshipStore.getRelationships());
                    }
                    friendList = ids.map(id => this._UserStore.getUser(id)).filter(u => u);
                    friendList.sort((a, b) => (a.username || "").localeCompare(b.username || ""));
                } catch(e) {}
            }

            const updateGlobal = (key, val) => {
                const nue = { ...global, [key]: val };
                setGlobal(nue);
                this.globalSettings = nue;
                this.saveData();
            };

            const updateFriend = (uid, key, val) => {
                const current = friends[uid] || { volume: 1.0, message: "", call: "" };
                const nue = { ...friends, [uid]: { ...current, [key]: val } };
                setFriends(nue);
                this.friendSettings = nue;
                this.saveData();
            };

            const renderInput = (label, value, onChange) => {
                const isBase64 = value && value.startsWith("data:");
                const displayValue = isBase64 ? "(Imported Audio Data)" : value;

                return BdApi.React.createElement("div", { style: { marginBottom: "15px" } }, [
                    BdApi.React.createElement("div", { style: { color: "var(--header-secondary)", fontSize: "12px", fontWeight: "700", marginBottom: "5px", textTransform: "uppercase" } }, label),
                    BdApi.React.createElement("div", { style: { display: "flex", gap: "10px" } }, [
                        // Text Input (For URLs or status)
                        BdApi.React.createElement("input", {
                            type: "text",
                            value: displayValue || "",
                            placeholder: "Import a file or paste URL...",
                            readOnly: isBase64, // Don't let them edit raw base64 manually
                            style: {
                                flex: 1,
                                padding: "8px",
                                borderRadius: "4px",
                                border: "1px solid var(--background-tertiary)",
                                backgroundColor: "#1e1f22",
                                color: isBase64 ? "#43b581" : "#dbdee1", // Green if imported
                                fontStyle: isBase64 ? "italic" : "normal"
                            },
                            onChange: (e) => !isBase64 && onChange(e.target.value)
                        }),
                        // Browse Button (The Magic)
                        BdApi.React.createElement("button", {
                            style: {
                                padding: "0 15px", borderRadius: "4px", backgroundColor: "#5865F2", color: "#fff", border: "none", cursor: "pointer", fontWeight: "500"
                            },
                            onClick: () => {
                                const fileInput = document.createElement("input");
                                fileInput.type = "file";
                                fileInput.accept = "audio/*"; // Accept any audio
                                fileInput.style.display = "none";
                                fileInput.onchange = (e) => handleFileSelect(e.target.files[0], onChange);
                                document.body.appendChild(fileInput);
                                fileInput.click();
                                document.body.removeChild(fileInput);
                            }
                        }, "Import"),
                        // Test Button
                        BdApi.React.createElement("button", {
                            style: {
                                padding: "0 15px", borderRadius: "4px", backgroundColor: "var(--brand-experiment)", color: "#fff", border: "none", cursor: "pointer"
                            },
                            onClick: () => {
                                if (value) new Audio(value).play();
                                else BdApi.UI.showToast("Nothing to play", {type: "warn"});
                            }
                        }, "Test"),
                        // Clear Button (Only if value exists)
                        value ? BdApi.React.createElement("button", {
                            style: {
                                padding: "0 10px", borderRadius: "4px", backgroundColor: "var(--status-danger)", color: "#fff", border: "none", cursor: "pointer"
                            },
                            onClick: () => onChange("")
                        }, "X") : null
                    ])
                ]);
            };

            const targetUser = selectedId && this._UserStore ? this._UserStore.getUser(selectedId) : null;
            const targetName = targetUser ? targetUser.username : (selectedId ? `User ID: ${selectedId}` : "None");

            return BdApi.React.createElement("div", { style: { padding: "15px", color: "#dbdee1" } }, [
                
                BdApi.React.createElement("h2", { style: { color: "var(--header-primary)", borderBottom: "2px solid var(--background-modifier-accent)", paddingBottom: "10px" } }, "Global Settings"),
                
                BdApi.React.createElement("div", { style: { marginTop: "15px", marginBottom: "20px" } }, [
                    BdApi.React.createElement("div", { style: { color: "var(--text-normal)", marginBottom: "5px", fontWeight: "bold" } }, `Master Volume: ${Math.round(global.volume * 100)}%`),
                    BdApi.React.createElement("input", {
                        type: "range", min: 0, max: 1, step: 0.1,
                        value: global.volume,
                        style: { width: "100%", cursor: "pointer" },
                        onChange: (e) => updateGlobal("volume", parseFloat(e.target.value))
                    })
                ]),
                
                renderInput("Default Message Sound", global.message, (v) => updateGlobal("message", v)),
                renderInput("Default Call Ringtone", global.call, (v) => updateGlobal("call", v)),

                BdApi.React.createElement("h2", { style: { color: "var(--header-primary)", marginTop: "40px", borderBottom: "2px solid var(--background-modifier-accent)", paddingBottom: "10px" } }, "Individual User Settings"),
                
                BdApi.React.createElement("div", { style: { marginTop: "15px", marginBottom: "15px", display: "flex", gap: "10px", alignItems: "center" } }, [
                    BdApi.React.createElement("select", {
                        style: {
                            flex: 1,
                            padding: "10px",
                            backgroundColor: "#1e1f22",
                            color: "#dbdee1",
                            border: "1px solid var(--background-tertiary)",
                            borderRadius: "4px",
                            cursor: "pointer"
                        },
                        value: selectedId,
                        onChange: (e) => {
                            setSelectedId(e.target.value);
                        }
                    }, [
                        BdApi.React.createElement("option", { value: "", style: { color: "#888" } }, `-- Select Friend (${friendList.length} found) --`),
                        ...friendList.map(f => BdApi.React.createElement("option", { 
                            value: f.id,
                            style: { backgroundColor: "#2b2d31" }
                        }, f.username))
                    ])
                ]),

                selectedId ? BdApi.React.createElement("div", { style: { background: "#2b2d31", padding: "20px", borderRadius: "8px", border: "1px solid var(--background-tertiary)" } }, [
                    BdApi.React.createElement("h3", { style: { color: "var(--header-primary)", marginTop: 0, marginBottom: "20px" } }, `Editing: ${targetName}`),
                    
                    renderInput("Custom Message Sound", friends[selectedId]?.message, (v) => updateFriend(selectedId, "message", v)),
                    renderInput("Custom Call Ringtone", friends[selectedId]?.call, (v) => updateFriend(selectedId, "call", v)),
                    
                    BdApi.React.createElement("button", {
                        style: {
                            marginTop: "10px",
                            padding: "10px",
                            backgroundColor: "var(--status-danger)",
                            color: "#fff",
                            border: "none",
                            borderRadius: "4px",
                            cursor: "pointer",
                            width: "100%",
                            fontWeight: "bold"
                        },
                        onClick: () => {
                            const newFriends = { ...friends };
                            delete newFriends[selectedId];
                            setFriends(newFriends);
                            this.friendSettings = newFriends;
                            this.saveData();
                            BdApi.UI.showToast("Settings reset for this user", {type: "info"});
                        }
                    }, "Reset This User to Defaults")
                ]) : null
            ]);
        };
    }
};
