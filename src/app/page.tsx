'use client';

import React, { useState, useEffect } from 'react';
import { Header } from '@/components/Header';
import { PreprocessingTab } from '@/components/preprocessing/PreprocessingTab';
import { AnnotationStudioTab } from '@/components/annotation/AnnotationStudioTab';

export default function Home() {
  const [activeTab, setActiveTab] = useState<'preprocessing' | 'annotation'>('preprocessing');
  const [inputFolder, setInputFolder] = useState<string>('');
  const [outputFolder, setOutputFolder] = useState<string>('');
  const [datasetFolder, setDatasetFolder] = useState<string>('');
  const [isHotkeysModalOpen, setIsHotkeysModalOpen] = useState<boolean>(false);

  // Restore stored paths from localStorage on mount
  useEffect(() => {
    try {
      const savedInput = localStorage.getItem('videomae_input_folder');
      const savedOutput = localStorage.getItem('videomae_output_folder');
      const savedDataset = localStorage.getItem('videomae_dataset_folder');

      if (savedInput) setInputFolder(savedInput);
      if (savedOutput) {
        setOutputFolder(savedOutput);
        setDatasetFolder(savedDataset || savedOutput);
      } else if (savedDataset) {
        setDatasetFolder(savedDataset);
      }
    } catch {
      // ignore
    }
  }, []);

  const handleInputFolderChange = (val: string) => {
    setInputFolder(val);
    try {
      localStorage.setItem('videomae_input_folder', val);
    } catch {}
  };

  const handleOutputFolderChange = (val: string) => {
    setOutputFolder(val);
    try {
      localStorage.setItem('videomae_output_folder', val);
      // Auto-set dataset folder if empty
      if (!datasetFolder) {
        setDatasetFolder(val);
        localStorage.setItem('videomae_dataset_folder', val);
      }
    } catch {}
  };

  const handleDatasetFolderChange = (val: string) => {
    setDatasetFolder(val);
    try {
      localStorage.setItem('videomae_dataset_folder', val);
    } catch {}
  };

  const handleGoToAnnotation = () => {
    if (outputFolder && (!datasetFolder || datasetFolder !== outputFolder)) {
      setDatasetFolder(outputFolder);
      try {
        localStorage.setItem('videomae_dataset_folder', outputFolder);
      } catch {}
    }
    setActiveTab('annotation');
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#090d16]">
      {/* App Header */}
      <Header
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onOpenHotkeysModal={() => setIsHotkeysModalOpen(true)}
        datasetFolder={datasetFolder}
      />

      {/* Main Tab Content */}
      <div className="flex-1 flex overflow-hidden">
        {activeTab === 'preprocessing' ? (
          <div className="flex-1 overflow-y-auto">
            <PreprocessingTab
              inputFolder={inputFolder}
              outputFolder={outputFolder}
              onInputFolderChange={handleInputFolderChange}
              onOutputFolderChange={handleOutputFolderChange}
              onGoToAnnotation={handleGoToAnnotation}
            />
          </div>
        ) : (
          <AnnotationStudioTab
            datasetFolder={datasetFolder}
            onDatasetFolderChange={handleDatasetFolderChange}
            isHotkeysModalOpen={isHotkeysModalOpen}
            onCloseHotkeysModal={() => setIsHotkeysModalOpen(false)}
          />
        )}
      </div>
    </div>
  );
}
