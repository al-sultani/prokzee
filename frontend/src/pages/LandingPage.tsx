import React, { useState, useEffect, FormEvent } from 'react';
import { EventsOn, EventsEmit, EventsOff } from "../../wailsjs/runtime/runtime";
import { PlusCircle, AlertCircle, CheckCircle2, Database, Search, ChevronRight } from 'lucide-react';
import appIcon from '../assets/images/appicon.png';

interface LandingPageProps {
    onNameSubmit: (name: string) => void;
}

const LandingPage: React.FC<LandingPageProps> = ({ onNameSubmit }) => {
    const [projects, setProjects] = useState<string[]>([]);
    const [selectedProject, setSelectedProject] = useState<string>('');
    const [newProjectName, setNewProjectName] = useState<string>('');
    const [errorMessage, setErrorMessage] = useState<string>('');
    const [successMessage, setSuccessMessage] = useState<string>('');
    const [isCreatingProject, setIsCreatingProject] = useState<boolean>(false);
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [isLoading, setIsLoading] = useState<boolean>(false);

    useEffect(() => {
        const handleListProjects = (data: { projects?: string[]; error?: string }) => {
            if (data.projects) {
                // TODO: Remove this once we have a better way to handle the default project
                const filteredProjects = data.projects.filter(project => !project.toLowerCase().includes("default_project.db"));
                setProjects(filteredProjects);
            } else {
                console.error("Failed to list projects:", data.error);
            }
        };

        const handleCreateNewProject = (data: { success: boolean; error?: string }) => {
            setIsCreatingProject(false);
            if (data.success) {
                setSuccessMessage("New project created successfully!");
                EventsEmit("frontend:listProjects");
                setTimeout(() => setSuccessMessage(""), 5000);
                setNewProjectName('');
            } else {
                setErrorMessage(`Failed to create new project: ${data.error}`);
                setTimeout(() => setErrorMessage(""), 5000);
            }
        };

        const handleSwitchProject = (data: { success: boolean; projectName?: string; error?: string }) => {
            setIsLoading(false);
            if (data.success) {
                console.log("Project switched successfully!");
                onNameSubmit("default");
            } else {
                setErrorMessage(`Failed to switch project: ${data.error}`);
                setTimeout(() => setErrorMessage(""), 5000);
            }
        };

        EventsOn("backend:listProjects", handleListProjects);
        EventsOn("backend:createNewProject", handleCreateNewProject);
        EventsOn("backend:switchProject", handleSwitchProject);
        EventsEmit("frontend:listProjects");

        return () => {
            EventsOff("backend:listProjects");
            EventsOff("backend:createNewProject");
            EventsOff("backend:switchProject");
        };
    }, [onNameSubmit]);

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        if (!selectedProject) {
            setErrorMessage('Please select a project.');
            setTimeout(() => setErrorMessage(""), 5000);
            return;
        }

        EventsEmit("frontend:switchProject", selectedProject);
    };

    const handleCreateNewProject = () => {
        const trimmedName = newProjectName.trim();
        if (trimmedName === "") {
            setErrorMessage("Project name cannot be empty");
            setTimeout(() => setErrorMessage(""), 5000);
            return;
        }

        const validNameRegex = /^[A-Za-z0-9 ]+$/;
        if (!validNameRegex.test(trimmedName)) {
            setErrorMessage("Project name can only contain A-Z, a-z, 0-9, and spaces");
            setTimeout(() => setErrorMessage(""), 5000);
            return;
        }

        setErrorMessage("");
        setSuccessMessage("");
        setIsCreatingProject(true);
        EventsEmit("frontend:createNewProject", trimmedName);
    };

    const filteredProjects = projects.filter(project =>
        project.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="landing-page min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-dark-primary dark:to-dark-secondary p-6 pb-24">
            {isLoading && (
                <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-center justify-center">
                    <div className="bg-white dark:bg-dark-secondary rounded-2xl p-8 flex flex-col items-center gap-4 shadow-xl">
                        <div className="w-12 h-12 border-4 border-indigo-600 dark:border-indigo-400 border-t-transparent rounded-full animate-spin"></div>
                        <p className="text-gray-600 dark:text-gray-300 text-sm font-medium">Switching Project...</p>
                    </div>
                </div>
            )}
            <div className="max-w-7xl mx-auto h-full flex flex-col">
                {/* Header Section */}
                <div className="text-center mb-12">
                    <div className="w-32 h-32 mx-auto mb-8 flex items-center justify-center relative">
                        <img 
                            src={appIcon} 
                            alt="ProkZee Logo" 
                            className="w-full h-full object-contain"
                        />
                    </div>
                    <h1 className="text-5xl font-bold mb-4 text-gray-800 dark:text-white bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-purple-600">
                        Welcome to ProKZee
                    </h1>
                    <p className="text-xl text-gray-600 dark:text-gray-300">Manage and organize your projects efficiently</p>
                </div>

                {/* Create New Project Section */}
                <div className="bg-white dark:bg-dark-secondary rounded-2xl shadow-xl p-6 mb-8">
                    <div className="flex items-center gap-4">
                        <input
                            type="text"
                            spellCheck="false"
                            value={newProjectName}
                            onChange={(e) => setNewProjectName(e.target.value)}
                            placeholder="Enter new project name"
                            className="flex-1 p-4 border-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-dark-accent text-gray-800 dark:text-white border-gray-200 dark:border-gray-600 transition-all duration-200"
                        />
                        <button
                            onClick={handleCreateNewProject}
                            disabled={isCreatingProject}
                            className="px-6 py-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl hover:from-indigo-700 hover:to-purple-700 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 min-w-[160px] justify-center"
                        >
                            <PlusCircle className="h-5 w-5" />
                            <span>Create Project</span>
                        </button>
                    </div>
                </div>

                {/* Projects Table Section */}
                <div className="bg-white dark:bg-dark-secondary rounded-2xl shadow-xl overflow-hidden mb-16">
                    <div className="p-6 border-b border-gray-200 dark:border-gray-700">
                        <div className="flex items-center justify-between">
                            <h2 className="text-xl font-semibold text-gray-800 dark:text-white flex items-center gap-2">
                                <Database className="h-6 w-6 text-indigo-600" />
                                Available Projects
                            </h2>
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                                <input
                                    type="text"
                                    placeholder="Search projects..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="pl-10 pr-4 py-2 border-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-dark-accent text-gray-800 dark:text-white border-gray-200 dark:border-gray-600"
                                    autoComplete="off"
                                    spellCheck="false"
                                />
                            </div>
                        </div>
                    </div>
                    
                    <div className="relative">
                        <div className="overflow-x-auto">
                            <div className="overflow-y-auto max-h-[300px] scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600 scrollbar-track-transparent">
                                <table className="w-full table-fixed">
                                    <thead className="bg-gray-50 dark:bg-dark-accent sticky top-0 z-10 border-b border-gray-200 dark:border-gray-700">
                                        <tr>
                                            <th className="w-[85%] px-4 py-1 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Project Name</th>
                                            <th className="w-[15%] px-4 py-1 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                        {filteredProjects.map((project, index) => (
                                            <tr key={index} className="hover:bg-gray-50 dark:hover:bg-dark-accent/50 transition-colors">
                                                <td className="w-[85%] px-4 py-1 text-xs text-gray-800 dark:text-gray-200 truncate">{project}</td>
                                                <td className="w-[15%] px-4 py-1">
                                                    <div className="flex justify-center">
                                                        <button
                                                            onClick={() => {
                                                                setSelectedProject(project);
                                                                setIsLoading(true);
                                                                EventsEmit("frontend:switchProject", project);
                                                            }}
                                                            className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
                                                        >
                                                            Open
                                                            <ChevronRight className="h-3 w-3" />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                        {filteredProjects.length === 0 && (
                                            <tr>
                                                <td colSpan={2} className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">
                                                    No projects found
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Notification Section */}
                <div className="fixed bottom-6 right-6 space-y-4">
                    {errorMessage && (
                        <div className="flex items-center gap-3 text-red-600 bg-white dark:bg-dark-secondary p-4 rounded-xl shadow-lg animate-fadeIn">
                            <AlertCircle className="h-5 w-5 flex-shrink-0" />
                            <p className="text-sm font-medium">{errorMessage}</p>
                        </div>
                    )}

                    {successMessage && (
                        <div className="flex items-center gap-3 text-green-600 dark:text-green-400 bg-white dark:bg-dark-secondary p-4 rounded-xl shadow-lg animate-fadeIn">
                            <CheckCircle2 className="h-5 w-5 flex-shrink-0" />
                            <p className="text-sm font-medium">{successMessage}</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default LandingPage;