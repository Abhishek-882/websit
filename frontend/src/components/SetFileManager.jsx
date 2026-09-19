import React, { useState, useEffect } from 'react';
import { useBotStore } from '../stores/botStore';
import { botApi } from '../api/botClient';
import { IconBot, IconCheck, IconTrash, IconClose } from './Icons';

export default function SetFileManager() {
  const connectedWallet = useBotStore(s => s.connectedWallet);
  const setFiles = useBotStore(s => s.setFiles);
  const setSetFiles = useBotStore(s => s.setSetFiles);
  const activeSetFile = useBotStore(s => s.activeSetFile);
  const setActiveSetFile = useBotStore(s => s.setActiveSetFile);

  const [isEditing, setIsEditing] = useState(false);
  const [currentFile, setCurrentFile] = useState(null);
  const [nameError, setNameError] = useState(null);

  // Sync set files from backend or auto-heal from localStorage on mount/wallet change
  useEffect(() => {
    if (!connectedWallet) return;
    botApi.getSetFiles(connectedWallet).then(res => {
      const serverFiles = res?.setFiles || [];
      if (serverFiles.length > 0) {
        setSetFiles(serverFiles);
        const active = serverFiles.find(f => f.isActive) || serverFiles[serverFiles.length - 1];
        if (active) {
          setActiveSetFile(active);
        }
      } else if (setFiles && setFiles.length > 0) {
        // Self-healing: Local storage has files, but server doesn't (e.g. server restart)
        // Auto-sync local files to server so it continues running 24/7!
        Promise.all(setFiles.map(f => botApi.saveSetFile(connectedWallet, f))).then(() => {
          const active = activeSetFile || setFiles[0];
          if (active?.id) {
            botApi.activateSetFile(connectedWallet, active.id).then(() => {
              botApi.getSetFiles(connectedWallet).then(r => {
                if (r?.setFiles) {
                  setSetFiles(r.setFiles);
                  const act = r.setFiles.find(f => f.isActive) || r.setFiles[0];
                  if (act) setActiveSetFile(act);
                }
              });
            });
          }
        });
      }
    }).catch(err => {
      console.warn('Failed to load set files:', err.message);
    });
  }, [connectedWallet]);

  const handleActivate = async (file) => {
    if (!connectedWallet || !file) return;
    const fileId = file.id || file._id;
    if (!fileId) {
      alert('This set file has no ID. Please edit and save it once to assign an ID.');
      return;
    }
    try {
      await botApi.activateSetFile(connectedWallet, fileId);
      setActiveSetFile({ ...file, id: fileId });
      const res = await botApi.getSetFiles(connectedWallet);
      setSetFiles(res.setFiles || []);
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDeactivate = async () => {
    if (!connectedWallet) return;
    try {
      await botApi.deactivateSetFile(connectedWallet);
      setActiveSetFile(null);
      const res = await botApi.getSetFiles(connectedWallet);
      setSetFiles(res.setFiles || []);
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDelete = async (fileOrId) => {
    if (!connectedWallet) return;
    const fileId = typeof fileOrId === 'object' ? (fileOrId.id || fileOrId._id) : fileOrId;
    if (!fileId) {
      alert('Cannot delete file: missing ID');
      return;
    }
    if (!confirm('Delete this set file?')) return;
    try {
      await botApi.deleteSetFile(connectedWallet, fileId);
      const res = await botApi.getSetFiles(connectedWallet);
      const remaining = res.setFiles || [];
      setSetFiles(remaining);
      if (activeSetFile?.id === fileId) {
        const nextActive = remaining.find(f => f.isActive) || (remaining.length > 0 ? remaining[0] : null);
        setActiveSetFile(nextActive);
        if (nextActive?.id) {
          await botApi.activateSetFile(connectedWallet, nextActive.id);
        }
      }
    } catch (err) {
      alert(err.message);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!connectedWallet) return;

    if (currentFile.name.length > 50) {
      setNameError("Name must be max 50 characters");
      return;
    }
    const isTaken = setFiles.some(f => f.name.toLowerCase() === currentFile.name.toLowerCase() && f.id !== currentFile.id);
    if (isTaken) {
      setNameError("Name is already taken for this wallet");
      return;
    }
    setNameError(null);

    const fileId = currentFile.id || `set_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const shouldBeActive = currentFile.isActive !== undefined ? currentFile.isActive : (setFiles.length === 0 || !activeSetFile);

    const payload = {
      ...currentFile,
      id: fileId,
      name: currentFile.name.trim(),
      isActive: shouldBeActive,
      tradeSizeSol: Number(currentFile.tradeSizeSol || 0.1),
      slippageBps: Number(currentFile.slippageBps || 500),
      orderType: currentFile.orderType || 'market',
      limitDipPct: Number(currentFile.limitDipPct || 20),
      maxPositions: Number(currentFile.maxPositions || 5),
      useJito: currentFile.useJito ?? true,
      tradeConfig: {
        buyAmountSol: Number(currentFile.tradeSizeSol || 0.1),
        slippageBps: Number(currentFile.slippageBps || 500),
        useJito: currentFile.useJito ?? true,
        orderType: currentFile.orderType || 'market',
        limitDipPct: Number(currentFile.limitDipPct || 20),
        maxPositions: Number(currentFile.maxPositions || 5),
      },
      buyFilters: {
        mcapMin: Number(currentFile.buyFilters?.mcapMin || 0),
        mcapMax: Number(currentFile.buyFilters?.mcapMax || 0),
        ageMinMinutes: Number(currentFile.buyFilters?.ageMinMinutes || 0),
        ageMaxMinutes: Number(currentFile.buyFilters?.ageMaxMinutes || 0),
        ageMaxHours: Number(currentFile.buyFilters?.ageMaxMinutes ? (currentFile.buyFilters.ageMaxMinutes / 60) : (currentFile.buyFilters?.ageMaxHours || 0)),
        smartMin: Number(currentFile.buyFilters?.smartMin || 0),
        kolMin: Number(currentFile.buyFilters?.kolMin || 0),
        devNetWorthMinUsd: Number(currentFile.buyFilters?.devNetWorthMinUsd || 0),
        devMaxHoldingPct: Number(currentFile.buyFilters?.devMaxHoldingPct || 0),
        devMustNotHold: Boolean(currentFile.buyFilters?.devMustNotHold),
        devMustBeCex: Boolean(currentFile.buyFilters?.devMustBeCex),
      },
      dcaConfig: {
        enabled: Boolean(currentFile.dca?.enabled),
        maxParts: 3,
        dipLevels: currentFile.dca?.enabled ? [
          { part: 1, dipPct: 0, amountSol: Number(currentFile.tradeSizeSol || 0.1) },
          { part: 2, dipPct: Number(currentFile.dca?.part2DipPct || 10), amountSol: Number(currentFile.tradeSizeSol || 0.1) },
          { part: 3, dipPct: Number(currentFile.dca?.part3DipPct || 20), amountSol: Number(currentFile.tradeSizeSol || 0.1) },
        ] : [],
      },
      reentryRule: {
        enabled: true,
        noReentryDays: Number(currentFile.reentry?.cooldownDays || 7),
      },
    };

    try {
      await botApi.saveSetFile(connectedWallet, payload);
      const res = await botApi.getSetFiles(connectedWallet);
      const updatedFiles = res.setFiles || [];
      setSetFiles(updatedFiles);
      const active = updatedFiles.find(f => f.isActive) || updatedFiles[updatedFiles.length - 1];
      if (active) setActiveSetFile(active);
      setIsEditing(false);
      setCurrentFile(null);
    } catch (err) {
      alert(err.message);
    }
  };

  const startNew = () => {
    setNameError(null);
    setCurrentFile({
      id: `set_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name: 'New Profile',
      isActive: setFiles.length === 0,
      tradeSizeSol: 0.1,
      slippageBps: 500,
      orderType: 'market',
      limitDipPct: 20,
      maxPositions: 5,
      useJito: true,
      buyFilters: {
        mcapMin: 10000,
        mcapMax: 250000,
        ageMinMinutes: 0,
        ageMaxMinutes: 60,
        ageMaxHours: 1,
        smartMin: 1,
        kolMin: 0,
        devNetWorthMinUsd: 1000,
        devMaxHoldingPct: 0,
        devMustNotHold: false,
        devMustBeCex: false,
      },
      dca: {
        enabled: false,
        part2DipPct: 10,
        part3DipPct: 20,
      },
      reentry: {
        cooldownDays: 7,
      },
    });
    setIsEditing(true);
  };

  if (isEditing) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-slate-800">
          <h3 className="text-sm font-bold text-white">Edit Set File</h3>
          <button onClick={() => setIsEditing(false)} className="text-slate-400 hover:text-white">
            <IconClose className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={handleSave} className="space-y-3">
          <div>
            <label className="text-[11px] text-slate-400 block mb-1">Profile Name (Max 50 chars)</label>
            <input type="text" required maxLength={50} value={currentFile.name || ''} onChange={e => setCurrentFile({...currentFile, name: e.target.value})} className="w-full px-2 py-1.5 bg-slate-900 border border-slate-700 rounded text-xs text-white" />
            {nameError && <p className="text-[10px] text-red-400 mt-1">{nameError}</p>}
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-[11px] text-slate-400 block mb-1">Trade Size (SOL)</label>
              <input type="number" step="0.01" min="0.01" required value={currentFile.tradeSizeSol || 0.1} onChange={e => setCurrentFile({...currentFile, tradeSizeSol: parseFloat(e.target.value)})} className="w-full px-2 py-1.5 bg-slate-900 border border-slate-700 rounded text-xs text-white" />
            </div>
            <div>
              <label className="text-[11px] text-slate-400 block mb-1">Slippage (BPS)</label>
              <input type="number" required value={currentFile.slippageBps || 500} onChange={e => setCurrentFile({...currentFile, slippageBps: parseInt(e.target.value)})} className="w-full px-2 py-1.5 bg-slate-900 border border-slate-700 rounded text-xs text-white" />
            </div>
            <div>
              <label className="text-[11px] text-slate-400 block mb-1">Max Positions</label>
              <input type="number" min="1" max="20" value={currentFile.maxPositions || 5} onChange={e => setCurrentFile({...currentFile, maxPositions: parseInt(e.target.value)})} className="w-full px-2 py-1.5 bg-slate-900 border border-slate-700 rounded text-xs text-white" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] text-slate-400 block mb-1">Order Type</label>
              <select value={currentFile.orderType || 'market'} onChange={e => setCurrentFile({...currentFile, orderType: e.target.value})} className="w-full px-2 py-1.5 bg-slate-900 border border-slate-700 rounded text-xs text-white">
                <option value="market">Immediate Market Buy</option>
                <option value="limit">Dip / Limit Order</option>
              </select>
            </div>
            {currentFile.orderType === 'limit' && (
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Dip Trigger (%)</label>
                <input type="number" min="1" max="80" value={currentFile.limitDipPct || 20} onChange={e => setCurrentFile({...currentFile, limitDipPct: parseFloat(e.target.value)})} className="w-full px-2 py-1.5 bg-slate-900 border border-slate-700 rounded text-xs text-white" />
              </div>
            )}
          </div>
          
          <div className="pt-2 border-t border-slate-800">
            <label className="text-xs font-bold text-cyan-300">Autonomous Buy Criteria (Set File Filters)</label>
            <p className="text-[10px] text-slate-400 mb-2">Changing filters on the home page will NOT affect this bot once loaded.</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Min Mcap K ($000s)</label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={(Number(currentFile.buyFilters?.mcapMin) || 0) > 0 ? (Number(currentFile.buyFilters.mcapMin) / 1000) : ''}
                  onChange={e => {
                    const val = e.target.value === '' ? 0 : Number(e.target.value);
                    setCurrentFile({...currentFile, buyFilters: {...currentFile.buyFilters, mcapMin: val > 0 ? Math.round(val * 1000) : 0}});
                  }}
                  className="w-full px-2 py-1 bg-slate-900 border border-slate-700 rounded text-xs text-white"
                  placeholder="e.g. 10 (=$10k)"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Max Mcap K ($000s)</label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={(Number(currentFile.buyFilters?.mcapMax) || 0) > 0 ? (Number(currentFile.buyFilters.mcapMax) / 1000) : ''}
                  onChange={e => {
                    const val = e.target.value === '' ? 0 : Number(e.target.value);
                    setCurrentFile({...currentFile, buyFilters: {...currentFile.buyFilters, mcapMax: val > 0 ? Math.round(val * 1000) : 0}});
                  }}
                  className="w-full px-2 py-1 bg-slate-900 border border-slate-700 rounded text-xs text-white"
                  placeholder="e.g. 500 (=$500k)"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Min Age (Minutes)</label>
                <input
                  type="number"
                  min="0"
                  value={currentFile.buyFilters?.ageMinMinutes ?? ''}
                  onChange={e => {
                    const mins = e.target.value === '' ? 0 : Math.max(0, parseInt(e.target.value) || 0);
                    setCurrentFile({
                      ...currentFile,
                      buyFilters: {
                        ...currentFile.buyFilters,
                        ageMinMinutes: mins,
                      }
                    });
                  }}
                  className="w-full px-2 py-1 bg-slate-900 border border-slate-700 rounded text-xs text-white"
                  placeholder="0 = instant (0m)"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Max Age (Minutes)</label>
                <input
                  type="number"
                  min="0"
                  value={currentFile.buyFilters?.ageMaxMinutes ?? (currentFile.buyFilters?.ageMaxHours ? Math.round(currentFile.buyFilters.ageMaxHours * 60) : '')}
                  onChange={e => {
                    const mins = e.target.value === '' ? 0 : Math.max(0, parseInt(e.target.value) || 0);
                    setCurrentFile({
                      ...currentFile,
                      buyFilters: {
                        ...currentFile.buyFilters,
                        ageMaxMinutes: mins,
                        ageMaxHours: mins > 0 ? (mins / 60) : 0,
                      }
                    });
                  }}
                  className="w-full px-2 py-1 bg-slate-900 border border-slate-700 rounded text-xs text-white"
                  placeholder="0 = any age"
                />
              </div>
              <div className="col-span-2 sm:col-span-3 flex flex-wrap items-center justify-between gap-1 text-[10px] bg-slate-950/80 px-2 py-1.5 rounded border border-slate-800">
                <span className="text-slate-400">
                  Target Age: <strong className="text-cyan-300 font-mono">
                    {Number(currentFile.buyFilters?.ageMinMinutes || 0)}m &ndash; {Number(currentFile.buyFilters?.ageMaxMinutes || (currentFile.buyFilters?.ageMaxHours ? currentFile.buyFilters.ageMaxHours * 60 : 0)) > 0 ? `${Number(currentFile.buyFilters?.ageMaxMinutes || (currentFile.buyFilters?.ageMaxHours * 60))}m` : 'Unlimited'}
                  </strong>
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setCurrentFile({
                      ...currentFile,
                      buyFilters: { ...currentFile.buyFilters, ageMinMinutes: 0, ageMaxMinutes: 30, ageMaxHours: 0.5 }
                    })}
                    className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono text-[9px]"
                  >
                    0-30m
                  </button>
                  <button
                    type="button"
                    onClick={() => setCurrentFile({
                      ...currentFile,
                      buyFilters: { ...currentFile.buyFilters, ageMinMinutes: 5, ageMaxMinutes: 60, ageMaxHours: 1 }
                    })}
                    className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono text-[9px]"
                  >
                    5-60m
                  </button>
                  <button
                    type="button"
                    onClick={() => setCurrentFile({
                      ...currentFile,
                      buyFilters: { ...currentFile.buyFilters, ageMinMinutes: 15, ageMaxMinutes: 180, ageMaxHours: 3 }
                    })}
                    className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono text-[9px]"
                  >
                    15m-3h
                  </button>
                  <button
                    type="button"
                    onClick={() => setCurrentFile({
                      ...currentFile,
                      buyFilters: { ...currentFile.buyFilters, ageMinMinutes: 0, ageMaxMinutes: 1440, ageMaxHours: 24 }
                    })}
                    className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono text-[9px]"
                  >
                    0-24h
                  </button>
                </div>
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Min Smart Money</label>
                <input type="number" min="0" value={currentFile.buyFilters?.smartMin || 0} onChange={e => setCurrentFile({...currentFile, buyFilters: {...currentFile.buyFilters, smartMin: parseInt(e.target.value)}})} className="w-full px-2 py-1 bg-slate-900 border border-slate-700 rounded text-xs text-white" />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Min KOLs</label>
                <input type="number" min="0" value={currentFile.buyFilters?.kolMin || 0} onChange={e => setCurrentFile({...currentFile, buyFilters: {...currentFile.buyFilters, kolMin: parseInt(e.target.value)}})} className="w-full px-2 py-1 bg-slate-900 border border-slate-700 rounded text-xs text-white" />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Min Dev Net Worth ($)</label>
                <input type="number" min="0" value={currentFile.buyFilters?.devNetWorthMinUsd || 0} onChange={e => setCurrentFile({...currentFile, buyFilters: {...currentFile.buyFilters, devNetWorthMinUsd: parseFloat(e.target.value)}})} className="w-full px-2 py-1 bg-slate-900 border border-slate-700 rounded text-xs text-white" />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Max Dev Supply (%)</label>
                <input type="number" min="0" max="100" value={currentFile.buyFilters?.devMaxHoldingPct || 0} onChange={e => setCurrentFile({...currentFile, buyFilters: {...currentFile.buyFilters, devMaxHoldingPct: parseFloat(e.target.value)}})} className="w-full px-2 py-1 bg-slate-900 border border-slate-700 rounded text-xs text-white" placeholder="0 = off" />
              </div>
              <div className="flex items-center pt-3">
                <input type="checkbox" id="devMustNotHold" checked={currentFile.buyFilters?.devMustNotHold || false} onChange={e => setCurrentFile({...currentFile, buyFilters: {...currentFile.buyFilters, devMustNotHold: e.target.checked}})} className="mr-2 accent-cyan-400" />
                <label htmlFor="devMustNotHold" className="text-[10px] text-slate-300">Dev Must Not Hold (Sold 100%)</label>
              </div>
              <div className="flex items-center pt-3">
                <input type="checkbox" id="devMustBeCex" checked={currentFile.buyFilters?.devMustBeCex || false} onChange={e => setCurrentFile({...currentFile, buyFilters: {...currentFile.buyFilters, devMustBeCex: e.target.checked}})} className="mr-2 accent-cyan-400" />
                <label htmlFor="devMustBeCex" className="text-[10px] text-slate-300">CEX Funded Only</label>
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-800">
            <div className="flex items-center justify-between mb-2">
              <div>
                <label className="text-xs font-bold text-cyan-300 block">DCA Configuration (Dip Buying)</label>
                <span className="text-[10px] text-slate-400">Buy Part 1 immediately, then Part 2 & 3 on dips</span>
              </div>
              <input type="checkbox" checked={currentFile.dca?.enabled || false} onChange={e => setCurrentFile({...currentFile, dca: {...currentFile.dca, enabled: e.target.checked}})} className="w-3.5 h-3.5 accent-cyan-400" />
            </div>
            {currentFile.dca?.enabled && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">Part 2 Dip (%)</label>
                  <input type="number" min="1" max="90" value={currentFile.dca?.part2DipPct || 10} onChange={e => setCurrentFile({...currentFile, dca: {...currentFile.dca, part2DipPct: parseFloat(e.target.value)}})} className="w-full px-2 py-1 bg-slate-900 border border-slate-700 rounded text-xs text-white" />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">Part 3 Dip (%)</label>
                  <input type="number" min="1" max="95" value={currentFile.dca?.part3DipPct || 20} onChange={e => setCurrentFile({...currentFile, dca: {...currentFile.dca, part3DipPct: parseFloat(e.target.value)}})} className="w-full px-2 py-1 bg-slate-900 border border-slate-700 rounded text-xs text-white" />
                </div>
              </div>
            )}
          </div>

          <div className="pt-2 border-t border-slate-800">
             <label className="text-[10px] text-slate-400 block mb-1">No Re-entry Cooldown (Days)</label>
             <p className="text-[10px] text-slate-500 mb-1">Bot will not re-buy the same token within this time window</p>
             <input type="number" min="1" max="30" value={currentFile.reentry?.cooldownDays || 7} onChange={e => setCurrentFile({...currentFile, reentry: {...currentFile.reentry, cooldownDays: parseInt(e.target.value)}})} className="w-full px-2 py-1 bg-slate-900 border border-slate-700 rounded text-xs text-white" />
          </div>

          <div className="pt-3 border-t border-slate-800 flex justify-end gap-2">
            <button type="button" onClick={() => setIsEditing(false)} className="px-3 py-1.5 rounded bg-slate-800 text-xs hover:bg-slate-700 transition-colors">Cancel</button>
            <button type="submit" className="px-4 py-1.5 rounded bg-cyan-600 text-white text-xs font-bold hover:bg-cyan-500 transition-colors">Save Set File</button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between pb-2 border-b border-slate-800">
        <h3 className="text-sm font-bold text-white">Bot Set Files</h3>
        <button onClick={startNew} className="px-3 py-1 text-xs font-bold bg-cyan-600/20 text-cyan-400 border border-cyan-700/50 hover:bg-cyan-600/40 rounded transition-colors">+ Create New</button>
      </div>
      
      {setFiles.length === 0 ? (
        <p className="text-xs text-slate-400 text-center py-6 bg-slate-900/50 rounded-lg border border-dashed border-slate-800">No set files found. Create one to start autonomous trading.</p>
      ) : (
        <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
          {setFiles.map(f => (
            <div key={f.id} className={`p-3 rounded-lg border ${f.isActive ? 'bg-emerald-950/40 border-emerald-700/50 shadow-sm shadow-emerald-900/20' : 'bg-slate-900/60 border-slate-800'} flex items-center justify-between transition-colors`}>
              <div>
                <h4 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                  {f.name}
                  {f.isActive && <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-mono tracking-wider border border-emerald-800/50">ACTIVE</span>}
                </h4>
                <p className="text-[10px] text-slate-400 font-mono mt-1">
                  Size: <span className="text-cyan-400">{f.tradeSizeSol} SOL</span> | 
                  MCap: {f.buyFilters?.mcapMin ? (f.buyFilters.mcapMin/1000).toFixed(0)+'k' : '0'}-{f.buyFilters?.mcapMax ? (f.buyFilters.mcapMax/1000).toFixed(0)+'k' : '8'} | 
                  Age: {f.buyFilters?.ageMinMinutes || 0}m-{f.buyFilters?.ageMaxMinutes ? `${f.buyFilters.ageMaxMinutes}m` : (f.buyFilters?.ageMaxHours ? `${Math.round(f.buyFilters.ageMaxHours * 60)}m` : 'Any')} | 
                  Smart: {f.buyFilters?.smartMin || 0}+
                </p>
                {f.dca?.enabled && (
                  <p className="text-[10px] text-purple-400 font-mono mt-0.5">
                    DCA Enabled (Part 2: -{f.dca.part2DipPct}%, Part 3: -{f.dca.part3DipPct}%)
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {f.isActive ? (
                  <button onClick={handleDeactivate} className="px-2.5 py-1 bg-amber-950/60 text-amber-400 border border-amber-800/60 hover:bg-amber-900/60 rounded text-[10px] font-bold transition-colors">Deactivate</button>
                ) : (
                  <button onClick={() => handleActivate(f)} className="px-2.5 py-1 bg-emerald-950/60 text-emerald-400 border border-emerald-800/60 hover:bg-emerald-900/60 rounded text-[10px] font-bold transition-colors">Activate</button>
                )}
                <button
                  onClick={() => {
                    setCurrentFile({
                      ...f,
                      buyFilters: {
                        ...f.buyFilters,
                        ageMinMinutes: f.buyFilters?.ageMinMinutes || 0,
                        ageMaxMinutes: f.buyFilters?.ageMaxMinutes ?? (f.buyFilters?.ageMaxHours ? Math.round(f.buyFilters.ageMaxHours * 60) : 0),
                      }
                    });
                    setIsEditing(true);
                  }}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[10px] font-bold transition-colors border border-slate-700"
                >
                  Edit
                </button>
                <button onClick={() => handleDelete(f.id)} className="p-1 bg-rose-950/50 hover:bg-rose-900/60 text-rose-400 rounded text-[10px] border border-rose-800/50 transition-colors" title="Delete"><IconTrash className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
