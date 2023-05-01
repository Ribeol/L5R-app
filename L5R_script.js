"use strict";

// #region Class definitions ----------------------------------------------------------------------------------------------------

class DataManager {
    static cacheName = "L5R_app";

     // For each language + base, the JSON file with a matching name will be cached for each of the following content types.
    static contentTypes = ["clans", "families", "schools", "rings", "skills", "techniques", "techniqueTypes", "titles", "traditions", "display"];

    constructor() {

        // Singleton pattern
        if (DataManager.instance) {
            return DataManager.instance;
        }
        DataManager.instance = this;

        // this.userSettings will get object properties through initialize, and will be used to restore the content to its last state
        this.userSettings = undefined;
        // this.content will get all the game content from cached JSON files through initialize, based on the language from usersettings
        this.content = {};

        // this.characterNames will store the names of all loadable characters in an array
        this.characterNames = undefined;
        
        // this.loaded is a container for the loaded character and data derived from it and this.content
        this.loaded = {
            character: undefined,
            school: undefined,
            titles: undefined,
            abilities: [], // [[string]]
            ringMaps: { // Maps of [ringRef, int]
                all: undefined, 
                upgradable: undefined
            },
            skillMaps: { // Maps of [skillRef, int]
                all: undefined,
                learned: undefined, 
                upgradable: undefined,                
                included: undefined,
                current: undefined
            },
            techSets: { // Sets of techniqueRefs
                learned: undefined,
                compatible: undefined,
                available: undefined,
                missable: undefined,
                included: undefined,
                current: undefined
            },
            remainingExp: undefined
        };
    }

    async initialize() {

        // Create an array of all content directory paths
        const paths = ["/content/base"];
        UserSettings.languages.forEach(language => {
            paths.push(`/content/${language}`);
        });
      
        // Create content properties as objects, and an array of urls for all content files
        const urls = [];
        DataManager.contentTypes.forEach(contentType => {
            dataManager.content[contentType] = {};
            paths.forEach(path => {
                urls.push(`${path}/${contentType}.json`);            
            });            
        });
              
        if ("caches" in window) {
            const cache = await caches.open(DataManager.cacheName);

            // Cache all JSON files from all languages
            await cache.addAll(urls);

            // Get dataManager.userSettings and dataManager.characterNames
            dataManager.userSettings = await dataManager.getUserSettings(cache);
            dataManager.characterNames = await dataManager.getCharacterNames(cache);

            // Complete the content properties by merging data from base and english directories by default, then overwriting english data if necessary
            await dataManager.getContent(cache, `/content/base`);
            await dataManager.getContent(cache, `/content/en`);
            if (dataManager.userSettings.language !== "en") {
                await dataManager.getContent(cache, `/content/${dataManager.userSettings.language}`);
            }
        }
        else {
            // ERROR MESSAGE, CLOSE APPLICATION? <<<<<<<<<<<<<<<
        }
    }

    async cacheUserSettings() {
        const cache = await caches.open(DataManager.cacheName);
        await cache.put("userSettings.json", new Response(JSON.stringify(dataManager.userSettings)));
    }

    async getUserSettings(cache) {
        // If userSettings.json exists in the cache, assign the corresponding object to dataManager.userSettings, otherwise create a new UserSettings
        const response = await cache.match("/userSettings.json");
        if (response) {
            const jsonObject = await response.json();
            return jsonObject;
        }
        else {
            return new UserSettings();
        }
        // Change the page language to reflect userSettings
        document.documentElement.lang = dataManager.userSettings.language;
    }

    async cacheCharacter() {
        // Cache the loaded character in /characters, in the form of familyName_givenName.json
        const cache = await caches.open(DataManager.cacheName);
        await cache.put(`characters/${dataManager.content.families[dataManager.loaded.character.familyRef].name}_${dataManager.loaded.character.givenName}.json`, new Response(JSON.stringify(dataManager.loaded.character)));        
    }

    async getCharacterNames(cache) {
        const names = [];
        await cache.keys().then(requests => {
            requests.forEach(request => {
                // for each JSON file in the cache, check if it is in /characters
                if (request.url.includes('/characters/')) {
                    // If so, get the character's name from the file name and push it to the names array
                    const nameStart = request.url.search("/characters/") + "/characters/".length;
                    const characterName = request.url.slice(nameStart,-5).replace("_"," ");
                    names.push(characterName);
                }
            });
        });
        return names;
    }

    async loadCharacter(characterName) {
        const cache = await caches.open(DataManager.cacheName);
        // Get the file name from the character's name and try to find it in the cache
        const jsonName = `${characterName}.json`.replace(" ","_");        
        const response = await cache.match(`/characters/${jsonName}`);
        // If the json file exists in the cache, assign the corresponding object to dataManager.loaded.character
        if (response) {
            const jsonObject = await response.json();
            dataManager.loaded.character = jsonObject;
            dataManager.updateFilteredSets(jsonObject);
        }
        else {
            dataManager.loaded = null;
            // RESET DISPLAY?
        }
    }

    async getContent(cache, directoryPath) {
        const promises = DataManager.contentTypes.map(async contentType => {
            // For each content type, get an object from the corresponding file in directoryPath
            const response = await cache.match(`${directoryPath}/${contentType}.json`);
            const jsonObject = await response.json();
            // If content has already been stored for this contentType (for instance techniques), assign the content from this file to its properties (specific techniques)
            if (Object.keys(dataManager.content[contentType]).length > 0) {
                Object.keys(jsonObject).forEach((propertyName) => {
                    // If the property exists, complete the existing sub-properties (technique type, etc.)
                    if (dataManager.content[contentType][propertyName] !== undefined) {
                        Object.assign(dataManager.content[contentType][propertyName], jsonObject[propertyName]);
                    }
                    // If not, create the property
                    else {
                        dataManager.content[contentType][propertyName] = jsonObject[propertyName];
                    }
                });
            }
            // If content doesn't exist for this contentType, store the corresponding object as a content property
            else {
                Object.assign(dataManager.content[contentType], jsonObject);
            }
        });      
        await Promise.all(promises);
    }

    updateFilteredSets(character) {
        // MAKE A DIFFERENT FUNCTION FOR LEARNING SKILLS/TECHS, RANK UPS, NEW TITLES? OR RUN AGAIN EACH TIME (INEFFICIENT)

        // The following sets and maps used will be used to update filtered sets down the line
        
        const ringsLearned = new Map(); // Map of [ring, int]
        for (const ringRef of Object.keys(character.startingRingRefs)) {
            ringsLearned.set(dataManager.content.rings[ringRef], character.startingRingRefs[ringRef]);
        }

        const skillsLearned = new Map(); // Map of [skill, int]
        for (const skillRef of Object.keys(character.startingSkillRefs)) {
            skillsLearned.set(dataManager.content.skills[skillRef], character.startingSkillRefs[skillRef]);
        }

        const techsLearned = new Set(); // Set of techniques
        for (const techRef of character.startingTechniqueRefs) {
            techsLearned.add(dataManager.content.techniques[techRef]);            
        }

        //let oldSkills = new Set();
        let currentSkills = new Set();
        let futureSkills = new Set();

        //let oldTechs = new Set();
        let currentTechs = new Set();
        let futureTechs = new Set();

        // Variables used to get the above

        const ringCostPerRank = 3;
        const skillCostPerRank = 2;
        const defaultTechCost = 3;

        const progress = character.progress;
        const spentExp = {};
        const progressExp = {};
        let schoolRef;
        let schoolRank = 1;

        // Get the school and titles from progress
        const curricula = {};
        for (const key of Object.keys(progress)) {
            if (Object.keys(dataManager.content.schools).includes(key)) {
                schoolRef = key;
                const school = dataManager.content.schools[schoolRef];
                curricula[schoolRef] = school.curriculum;
                dataManager.loaded.abilities.push(school.schoolAbility);
                dataManager.loaded.school = school;
            }
            else {
                curricula[key] = dataManager.content.titles[key].curriculum;
                // FIND A WAY TO IMPLEMENT IMMEDIATE EFFECTS FROM TITLES
            }
        }

        // Loop through all the curricula
        for (const key of Object.keys(curricula)) {

            spentExp[key] = 0;
            progressExp[key] = 0;
            let previousRanksExp = 0;
            let learningIndex = 0;

            // Loop through each rank in each curriculum            
            for (let i = 0; i < curricula[key].length; i++) {

                const rankSkills = new Set();
                const rankTechs = new Set();

                // Loop through all the strings in curricula[key][i].list
                for (const refString of curricula[key][i].list) {
                    if (refString.startsWith('S: ')) {
                        // If it is an individual skill, add it to the rankSkills set
                        const skillRef = refString.slice(3);
                        rankSkills.add(dataManager.content.skills[skillRef]);
                    }
                    else if (refString.startsWith('SG: ')) {
                        // If it is a group of skills, find all skills that belong to the group and add them to the rankSkills set
                        const skillGroup = refString.slice(4);
                        for (const skill of Object.values(dataManager.content.skills)) {
                            if (skill.group === skillGroup) {
                                rankSkills.add(skill);
                            }
                        }
                    }
                    if (refString.startsWith('T: ')) {
                        // If it is an individual technique, add it to the rankTechs set
                        const techRef = refString.slice(3);
                        rankTechs.add(dataManager.content.techniques[techRef]);
                    }
                    else if (refString.startsWith('TG: ')) {
                        // If it is a group of techniques, find all techniques that belong to the group and add them to the rankTechs set
                        const groupString = refString.slice(4).split(' ').reverse();
                        const groupRing = groupString[2];                              
                        const groupType = groupString[1];
                        const groupMaxRank = parseInt(groupString[0]);                        
                        for (const tech of Object.values(dataManager.content.techniques)) {
                            if ((!groupRing || tech.ringRef === groupRing) && tech.typeRef === groupType && tech.rank <= groupMaxRank) {
                                rankTechs.add(tech);
                            }
                        }
                    }
                }

                const nextExpThreshold = previousRanksExp + curricula[key][i].exp;

                // Add everything that is learned for this rank to the corresponding maps or set, and calculate cost and progression
                // If the curriculum gets completed, finish all progress before ending the loop instead of stopping when nextExpThreshold is reached
                while ((progressExp[key] < nextExpThreshold || i === curricula[key].length - 1) && learningIndex < progress[key].length) {
                    let refString = progress[key][learningIndex];
                    let isFree = false;
                    // F stands for free. This means what is learned doesn't cost nor contribute experience points
                    if (refString.startsWith('F')) {
                        refString = refString.slice(1);
                        isFree = true;
                    }
                    if (refString.startsWith('R: ')) {
                        const ring = dataManager.content.rings[refString.slice(3)];
                        let newRank;
                        newRank = ringsLearned[ring] + 1;
                        ringsLearned.set(ring, newRank);
                        if (!isFree) {
                            const cost = newRank*ringCostPerRank;
                            spentExp[key] += cost;
                            progressExp[key] += cost/2;
                        }                    
                    }
                    else if (refString.startsWith('S: ')) {
                        const skill = dataManager.content.skills[refString.slice(3)];
                        let newRank;
                        if (skillsLearned[skill] !== undefined) {
                            newRank = skillsLearned[skill] + 1;
                        }
                        else {
                            newRank = 1;
                        }
                        skillsLearned.set(skill, newRank);
                        if (!isFree) {
                            const cost = newRank*skillCostPerRank;
                            spentExp[key] += cost;
                            if (rankSkills.has(skill)) {
                                progressExp[key] += cost;
                            }
                            else {
                                progressExp[key] += cost/2;
                            }
                        }
                    }
                    else { // refString.startsWith('T: ')
                        const tech = dataManager.content.techniques[refString.slice(3)];
                        techsLearned.add(tech);
                        if (!isFree) {
                            let techniqueCost = defaultTechCost;
                            if(tech.expCost !== undefined) {
                                techniqueCost = tech.expCost;                                
                            }
                            spentExp[key] += techniqueCost;
                            if (rankTechs.has(tech)) {
                                progressExp[key] += techniqueCost;
                            }
                            else {
                                progressExp[key] += techniqueCost/2;
                            }
                        }
                    }
                    learningIndex += 1;
                }

                // Based on progressExp for this curriculum, determine if the skills and techniques in rankSkills and rankTechs belong to a future rank, the current rank, or a past rank
                if (progressExp[key] < previousRanksExp) {
                    futureSkills = new Set([...futureSkills, ...rankSkills]);
                    futureTechs = new Set([...futureTechs, ...rankTechs]);
                }
                else if (progressExp[key] < nextExpThreshold){
                    currentSkills = new Set([...currentSkills, ...rankSkills]);
                    currentTechs = new Set([...currentTechs, ...rankTechs]);
                }
                else {
                    //oldSkills = new Set([...oldSkills, ...rankSkills]);
                    //oldTechs = new Set([...oldTechs, ...rankTechs]);
                    // If this past rank is of the school, increase schoolRank each loop until it gets to its true value of current rank
                    if (key === schoolRef) {
                        schoolRank += 1;
                    }
                    // If the final rank belongs to the past, then the curriculum is complete: unlock the final ability
                    if (i === curricula[key].length - 1) {
                        dataManager.loaded.abilities.push(dataManager.content.schools[key].finalAbility);
                    }
                }
                // Increase previousRanksExp before going through the loop again
                previousRanksExp = nextExpThreshold;
            }
        }

        // Give a value to dataManager.loaded.remainingExp by substracting the calculated totalSpentExp from the stored totalExp
        let totalSpentExp;
        for (const partialAmount of Object.values(spentExp)) {
            totalSpentExp += partialAmount;
        }
        dataManager.loaded.remainingExp = dataManager.loaded.character.totalExp - totalSpentExp;

        // Utility function to return full maps by adding unlearned things of rank 0 to a map containing only learned things of rank > 0
        // upgradeableOnly depends on what the map will be used for, and determines whether rank 5 should be included or not
        function getFullMap(keys, learnedMap, upgradeableOnly) {
            const filteredMap = new Map();
            for (const key of keys) {
                if (learnedMap.has(key)) {
                    if (!upgradeableOnly || learnedMap.get(key) < 5) {
                        filteredMap.set(key, learnedMap.get(key));
                    }
                }
                else {
                    filteredMap.set(key, 0);                  
                }
            }
            return filteredMap;
        }

        // Update the map of all rings
        dataManager.loaded.ringMaps.all = ringsLearned;

        // Update the map of all upgradable rings (ranks >= 5 not included)
        dataManager.loaded.ringMaps.upgradable = getFullMap(Object.values(dataManager.content.rings), ringsLearned, true);

        // Update the map of all known skills
        dataManager.loaded.skillMaps.learned = skillsLearned;

        // Update the map of all skills
        dataManager.loaded.skillMaps.all = getFullMap(Object.values(dataManager.content.skills), skillsLearned, false);

        // Update the map of all upgradable skills (ranks >= 5 not included)
        dataManager.loaded.skillMaps.upgradable = getFullMap(Object.values(dataManager.content.skills), skillsLearned, true);

        // Update the map of all curricula skills (past ranks not included, ranks >= 5 not included)
        dataManager.loaded.skillMaps.included = getFullMap(new Set([...currentSkills, ...futureSkills]), skillsLearned, true);

        // Update the map of all skills that fully contribute to the school or a title (ranks >= 5 not included)
        dataManager.loaded.skillMaps.current = getFullMap(currentSkills, skillsLearned, true);

        const compatibleTechsBase = new Set();
        for (const tech of Object.values(dataManager.content.techniques)) {
            if (dataManager.content.schools[schoolRef].techniqueTypeRefs.includes(tech.typeRef)) {
                compatibleTechsBase.add(tech);
            }
        }

        // Update the set of all known techniques
        dataManager.loaded.techSets.learned = techsLearned;

        // Update the set of all compatible techniques (learned included)
        dataManager.loaded.techSets.compatible = new Set([...compatibleTechsBase, ...currentTechs, ...futureTechs]);

        const availableTechsBase = new Set();
        for (const tech of compatibleTechsBase) {
            if (tech.rank <= schoolRank) {
                availableTechsBase.add(tech);
            }
        }
        // Update the set of all available techniques (learned not included)
        dataManager.loaded.techSets.available = new Set([...new Set([...availableTechsBase, ...currentTechs])].filter(x => !techsLearned.has(x)));

        // Update the set of all curricula techniques (past ranks not included)
        dataManager.loaded.techSets.included = new Set([...currentTechs, ...futureTechs]);

        // Update the set of all techniques that fully contribute to the school or a title (learned not included)
        dataManager.loaded.techSets.current = new Set([...currentTechs].filter(x => !techsLearned.has(x)));

        // Update the set of all missable techniques (past ranks not included)
        dataManager.loaded.techSets.missable = new Set([...dataManager.loaded.techSets.included].filter(x => !compatibleTechsBase.has(x)));
    }
}

class ContentManager {

    constructor() {

        // Singleton pattern
        if (ContentManager.instance) {
            return ContentManager.instance;
        }
        ContentManager.instance = this;

        // A map that will have clickable name elements as keys and techniques as values, to allow the user to consult techniques by clicking names
        this.nameMap = undefined;

        // A map that will have clickable add icons as keys and techniques as values, to allow the user to learn techniques by clicking add icons
        this.addIconMap = undefined;

        // liTop will store the original Y position of a list element while it is expanded
        this.liTop = undefined;
    }

    filterSkills(skillGroup, availabilitySetting, curriculaSetting) {

        // Get the filter settings








        // Get a combinedArray from the intersection of 2 maps, depending on availability and curricula filter settings
        let availabilitySet;
        switch(availabilitySetting) {
            case "all":
                availabilitySet = dataManager.loaded.skillMaps.all;
                break;
            case "learned":
                availabilitySet = dataManager.loaded.skillMaps.learned;
        }
        let combinedArray;
        switch(curriculaSetting) {            
            case "indifferent":
                combinedArray = [...availabilitySet];
                break;            
            case "excluded":
                combinedArray = [...availabilitySet].filter(x => !dataManager.loaded.skillMaps.included.has(x[0]));
                break;
            case "included":
                combinedArray = [...availabilitySet].filter(x => dataManager.loaded.skillMaps.included.has(x[0]));
                break;
            case "current":
                combinedArray = [...availabilitySet].filter(x => dataManager.loaded.skillMaps.current.has(x[0]));
        }
        
        // Additional filtering based on skill group
        const filteredSkills = combinedArray.filter(pair => {
            if (skillGroup !== "all" && pair[0].group !== skillGroup) {
                return false;
            }
            return true;
        });

        // ADD A NO RESULT MESSAGE IF NO RESULT, ELSE KEEP GOING

        // Ordering the array based on alphabetical order of skill groups, then skill names
        filteredSkills.sort(function(a, b) {
            if (a.group < b.group) {
                return -1;
            }
            else if (a.group > b.group) {
                return 1;
            }
            else {
                if (a.name < b.name) {
                    return -1;
                }
                else if (a.name > b.name) {
                    return 1;
                }
                else {
                    return 0;
                }
            }
        });
        // Clear the existing list
        const list = document.getElementById("contentList");
        list.innerHTML = "";

        // Create the fragment that will contain the new list elements
        const fragment = document.createDocumentFragment();

        // Create li elements to display for each skill, with span elements inside, each with the proper content and classes for styling









    }

    filterTechniques() {

        // Get the filter settings
        const techRank = document.getElementById("rankFilter").value;
        const techType = document.getElementById("typeFilter").value;
        const techRing = document.getElementById("ringFilter").value;
        const availabilitySetting = document.getElementById("availabilityFilter").value;
        const curriculaSetting = document.getElementById("curriculaFilter").value;

        // Get a combinedArray from the intersection of 2 sets, depending on availability and curricula filter settings
        let availabilitySet;
        switch(availabilitySetting) {
            case "learned":
                availabilitySet = dataManager.loaded.techSets.learned;
                break;
            case "all":
                availabilitySet = new Set(Object.values(dataManager.content.techniques));
                break;            
            case "compatible":
                availabilitySet = dataManager.loaded.techSets.compatible;
                break;
            case "available":
                availabilitySet = dataManager.loaded.techSets.available;
                break;
            case "missable":
                availabilitySet = dataManager.loaded.techSets.missable;
        }
        let combinedArray;
        switch(curriculaSetting) {            
            case "indifferent":
                combinedArray = [...availabilitySet];
                break;            
            case "excluded":
                combinedArray = [...availabilitySet].filter(x => !dataManager.loaded.techSets.included.has(x));
                break;
            case "included":
                combinedArray = [...availabilitySet].filter(x => dataManager.loaded.techSets.included.has(x));
                break;
            case "current":
                combinedArray = [...availabilitySet].filter(x => dataManager.loaded.techSets.current.has(x));
        }

        // Additional filtering based on rank, type, ring and clan
        const filteredTechniques = combinedArray.filter(technique => {
            if (techRank !== "all" && technique.rank !== parseInt(techRank)) {
                return false;
            }
            if (techType !== "all" && technique.typeRef !== techType) {
                return false;
            }
            if (techRing !== "all" && technique.ringRef !== techRing) {
                return false;
            }
            if (technique.clanRef !== undefined && technique.clanRef !== dataManager.loaded.character.clanRef && availabilitySetting !== "all") {
                return false;
            }
            return true;
        });

        // ADD A NO RESULT MESSAGE IF NO RESULT, ELSE KEEP GOING

        // Ordering the array based on rank order, then order of types from the source book, then alphabetical order of rings and names
        const techTypeOrder = ["Kata", "Kihō", "Invocation", "Ritual", "Shūji", "Mahō", "Ninjutsu"];    
        filteredTechniques.sort(function(a, b) {
            if (a.rank < b.rank) {
                return -1;
            }
            else if (a.rank > b.rank) {
                return 1;
            }
            else {
                if (techTypeOrder.indexOf(a.typeRef) < techTypeOrder.indexOf(b.typeRef)) {
                    return -1;
                }
                else if (techTypeOrder.indexOf(a.typeRef) > techTypeOrder.indexOf(b.typeRef)) {
                    return 1;
                }
                else {
                    if (a.ringRef < b.ringRef) {
                        return -1;
                    }
                    else if (a.ringRef > b.ringRef) {
                        return 1;
                    }
                    else {
                        if (a.name < b.name) {
                            return -1;
                        }
                        else if (a.name > b.name) {
                            return 1;
                        }
                        else {
                            return 0;
                        }
                    }
                }
            }
        });

        // Clear the existing list
        const list = document.getElementById("contentList");        
        list.innerHTML = "";        
        // reset nameMap and addIconMap for the new list
        contentManager.nameMap = new Map();
        contentManager.addIconMap = new Map();

        // Create the fragment that will contain the new list elements
        const fragment = document.createDocumentFragment();

        // Create li elements to display for each technique, with span elements inside, each with the proper content and classes for styling
        for (const tech of filteredTechniques) {            
            const li = document.createElement("li");

            const rankSpan = document.createElement("span");
            rankSpan.textContent += tech.rank;
            rankSpan.classList.add("rank");            

            const typeIconSpan = document.createElement("span");
            switch(tech.typeRef) {            
                case "Kata":
                    typeIconSpan.textContent = String.fromCharCode(0xe909);
                    break;
                case "Invocation":
                    typeIconSpan.textContent = String.fromCharCode(0xe908);
                    break;
                case "Shūji":
                    typeIconSpan.textContent = String.fromCharCode(0xe915);
                    break;
                case "Kihō":
                    typeIconSpan.textContent = String.fromCharCode(0xe90a);
                    break;
                case "Ritual":
                    typeIconSpan.textContent = String.fromCharCode(0xe911);
                    break;
                case "Ninjutsu":
                    typeIconSpan.textContent = String.fromCharCode(0xe90c);
                    break;            
                case "Mahō":
                    typeIconSpan.textContent = "魔";
                    typeIconSpan.classList.add("Mahō");
            }
            typeIconSpan.classList.add("left", "icon");

            li.appendChild(rankSpan);
            li.appendChild(typeIconSpan);

            const ringIconSpan = document.createElement("span");
            if (tech.ringRef !== undefined) {
                switch(tech.ringRef) {            
                    case "Air":
                        ringIconSpan.textContent = String.fromCharCode(0xe900);
                        break;
                    case "Earth":
                        ringIconSpan.textContent = String.fromCharCode(0xe904);
                        break;
                    case "Fire":
                        ringIconSpan.textContent = String.fromCharCode(0xe907);
                        break;
                    case "Water":
                        ringIconSpan.textContent = String.fromCharCode(0xe91d);
                        break;
                    case "Void":
                        ringIconSpan.textContent = String.fromCharCode(0xe91c);
                }
                ringIconSpan.classList.add("left", "icon", tech.ringRef);
                li.appendChild(ringIconSpan);
            }            
            
            const clanIconSpan = document.createElement("span");
            if (tech.clanRef !== undefined) {
                switch(tech.clanRef) {            
                    case "Crab":
                        clanIconSpan.textContent = String.fromCharCode(0xe901);
                        break;
                    case "Crane":
                        clanIconSpan.textContent = String.fromCharCode(0xe902);
                        break;
                    case "Dragon":
                        clanIconSpan.textContent = String.fromCharCode(0xe903);
                        break;
                    case "Lion":
                        clanIconSpan.textContent = String.fromCharCode(0xe90b);
                        break;
                    case "Phoenix":
                        clanIconSpan.textContent = String.fromCharCode(0xe90f);
                    case "Scorpion":
                        clanIconSpan.textContent = String.fromCharCode(0xe913);
                        break;
                    case "Unicorn":
                        clanIconSpan.textContent = String.fromCharCode(0xe91a);
                }
                clanIconSpan.classList.add("left", "icon");
                li.appendChild(clanIconSpan);
            }
            const nameSpan = document.createElement("span");
            nameSpan.textContent = tech.name;
            
            // If there is a traditional name to display, the element with the name class will be a container of 2 spans instead of a single span
            let addedElement;
            const traditionRef = dataManager.loaded.school.traditionRef;
            if (tech.traditionalNames !== undefined
            && traditionRef !== undefined
            && Object.keys(tech.traditionalNames).includes(traditionRef)) {
                addedElement = document.createElement("div")
                const traditionalNameSpan = document.createElement("span");
                traditionalNameSpan.textContent = tech.traditionalNames[traditionRef];
                traditionalNameSpan.classList.add("traditional", "customColor");
                addedElement.appendChild(nameSpan);
                addedElement.appendChild(traditionalNameSpan);
            }
            else {
                addedElement = nameSpan;
            }
            addedElement.classList.add("name", "pointer");
            addedElement.addEventListener('click', () => {
                contentManager.viewContentObject(li, list, contentManager.nameMap.get(addedElement));
            });
            contentManager.nameMap.set(addedElement, tech);
            li.appendChild(addedElement);
            

            // If the technique is included in unlearned future curriculum techniques, add the school icon
            if (dataManager.loaded.techSets.included.has(tech) && !dataManager.loaded.techSets.learned.has(tech)) {
                const schoolIconSpan = document.createElement("span");                    
                schoolIconSpan.textContent += String.fromCharCode(0xe912);
                schoolIconSpan.classList.add("right", "icon");

                // If it is part of a current rank, add the customColor class
                if (dataManager.loaded.techSets.current.has(tech)) {
                    schoolIconSpan.classList.add("customColor");
                }
                li.appendChild(schoolIconSpan);
            }

            // If the technique is available, learned or incompatible, the added class will allow it to be styled accordingly
            // Compatible is the default style and does not need a class
            if (dataManager.loaded.techSets.available.has(tech)) {
                li.classList.add("available");                
                const addIconSpan = document.createElement("span");
                addIconSpan.textContent = "+";
                addIconSpan.classList.add("right", "icon", "pointer");                
                addIconSpan.addEventListener('click', () => {
                    contentManager.addContentObject(contentManager.addIconMap.get(addIconSpan));
                });
                contentManager.addIconMap.set(addIconSpan, tech);
                li.appendChild(addIconSpan);
            }            
            else if (dataManager.loaded.techSets.learned.has(tech)) {
                li.classList.add("customColor");
            }  
            else if (!dataManager.loaded.techSets.compatible.has(tech)) {
                li.classList.add("incompatible");
            }            

            // Add each completed li to the fragment and to the item list
            fragment.appendChild(li);
        }
        // Create the new list from the completed fragment
        list.appendChild(fragment);        
    }







    // TEST FUCNTIONS BELOW

    changeTab(newTabName) {
        if(newTabName != currentTabName) {
            document.getElementById(currentTabName).classList.remove("currentTab");
            document.getElementById(newTabName).classList.add("currentTab");
            currentTabName = newTabName;
        }    
    }

    toggleOverlay() {
        document.getElementById("overlay").classList.toggle("visible");
        document.getElementById("main").classList.toggle("disabled");
    }

    selectSchoolTEST() { // THIS IS A TEMPORARY TEST FUNCTION. DELETE!

        const charSchoolRef = document.getElementById("tempSchoolDropdown").value;
        let charClanRef;

        const clanColors = new Map();
        clanColors.set("Crab", `hsl(210, 20%, 60%)`);
        clanColors.set("Crane",`hsl(195, 60%, 60%)`);
        clanColors.set("Dragon",`hsl(140, 40%, 50%)`);
        clanColors.set("Lion",`hsl(45, 70%, 50%)`);
        clanColors.set("Phoenix",`hsl(30, 80%, 60%)`);
        clanColors.set("Scorpion",`hsl(0, 70%, 50%)`);
        clanColors.set("Unicorn",`hsl(290, 40%, 60%)`);

        const root = document.querySelector(':root');

        for (const clanRef of Object.keys(dataManager.content.clans)) {
            for (const familyRef of dataManager.content.clans[clanRef].familyRefs) {
                if (familyRef === charSchoolRef) {;
                    charClanRef = clanRef;
                    root.style.setProperty('--customColor', clanColors.get(clanRef));
                }
            }
        }

        const emptyCharacter = new Character("", charClanRef, "", charSchoolRef, "", "", "", "", [""], [""], [""], [""], {Air:1, Earth:1, Fire:1, Water:1, Void:1}, {}, [], [], 0, 0, 0, 0);
        dataManager.loaded.character = emptyCharacter;
        dataManager.updateFilteredSets(emptyCharacter);
        contentManager.filterTechniques();
    }

    viewContentObject(li, list, technique) {

        // Animation duration
        const duration = 10;
        // Height fraction
        const fraction = 0.8;
        const targetTop = (1 - fraction) / 2 * window.innerHeight;
        const targetHeight = fraction * window.innerHeight;

        if (!li.classList.contains("expanded")) {
            li.classList.add("expanded");
            li.style.position = "fixed";
            //li.style.width = list.offsetWidth + "px"; // NOT GOOD ENOUGH BECAUSE DOES NOT ADAPT TO WINDOW CHANGES AFTER EXPAND. SAME FOR HEIGHT. MOVE "EXPANDED"?
            let liTop = li.getBoundingClientRect().top - list.scrollTop;
            contentManager.liTop = liTop;
            const movementSpeed = (liTop - targetTop) / duration;
            const growthSpeed = targetHeight / duration;

            let liHeight = 0;
		    function animate() {
			    liTop -= movementSpeed;
                liHeight += growthSpeed;
			    li.style.top = liTop + "px";
                li.style.height = liHeight + "px";
			    if (liTop <= targetTop) {
				    li.style.top = targetTop + "px";
                    li.style.height = targetHeight + "px";
				    return;
			    }
			    requestAnimationFrame(animate);
		    }
		    requestAnimationFrame(animate);            
        }
        else {            
            
            const movementSpeed = (contentManager.liTop - targetTop) / duration;
            const shrinkSpeed = targetHeight / duration;

            let liTop = targetTop;
            let liHeight = targetHeight;
		    function animate() {
			    liTop += movementSpeed;
                liHeight -= shrinkSpeed;
			    li.style.top = liTop + "px";
                li.style.height = liHeight + "px";
			    if (liTop >= contentManager.liTop) {
                    li.style.position = "";
				    li.style.top = "";
                    li.style.height = "";
                    li.classList.remove("expanded");
				    return;
			    }
			    requestAnimationFrame(animate);
		    }
		    requestAnimationFrame(animate);            
        }

        

        
        

        /*
        document.getElementById("overlay").classList.toggle("visible");
        document.getElementById("main").classList.toggle("disabled");
        document.getElementById("description").innerHTML = technique.description;
        */
    }
    addContentObject(technique) {
        // WRITE
    }
}

class UserSettings {
    static languages = ["en", "fr"];

    constructor() {
        const language = (navigator.language || navigator.userLanguage).slice(0,2);
        if (UserSettings.languages.includes(language)) {
            this.language = language;
        }
        else {
            this.language = "en";
        }
        //this.currentTab = "characterCreation"; // CHANGE?
        // ADD MORE? IF CHARACTER DETECTED IN CACHE, SET TAB TO CHOOSE CHARACTER, OTHERWISE CREATE CHARACTER
    }
}

class Character {
    constructor(givenName, clanRef, familyRef, schoolRef, giri, ninjō, relationships, personality, distinctionRefs, adversityRefs, passionRefs, anxietyRefs, startingRingRefs, startingSkillRefs, startingTechniqueRefs, itemRefs, honor, glory, status, totalExp) {
        
        this.givenName = givenName; // string
        this.clanRef = clanRef; // string
        this.familyRef = familyRef; // string
        this.progress = {}; // object with school and titles as properties, each containing [string] with prefixes for each refString
        this.progress[schoolRef] = []; 
        this.giri = giri; // string
        this.ninjō = ninjō; // string
        this.relationships = relationships; // string
        this.personality = personality; // string
        this.distinctionRefs = distinctionRefs; // [string]
        this.adversityRefs = adversityRefs; // [string]
        this.passionRefs = passionRefs; // [string]
        this.anxietyRefs = anxietyRefs; // [string]
        this.startingRingRefs = startingRingRefs; // object with keys Air Earth Fire Water Void, and int values
        this.startingSkillRefs = startingSkillRefs; // object with skillRef keys and int values
        this.startingTechniqueRefs = startingTechniqueRefs; // [string]
        this.itemRefs = itemRefs; // [[string, int]]
        this.totalExp = totalExp; // int

        this._honor = honor; // int
        this._glory = glory; // int
        this._status = status; // int
        this._fatigue = 0; // int
        this._strife = 0; // int
        this._voidPoints = Math.ceil(startingRingRefs["Void"]/2); // int
    }

    get honor() {return this._honor;}
    changeHonor(difference) {this._honor = Math.min(Math.max(0, this._honor += difference), 100);}

    get glory() {return this._glory;}
    changeHonor(difference) {this._glory = Math.min(Math.max(0, this._glory += difference), 100);}

    get status() {return this._status;}
    changeHonor(difference) {this._status = Math.min(Math.max(0, this._status += difference), 100);}

    get fatigue() {return this._fatigue;}
    changeFatigue(difference) {this._fatigue = Math.max(0, this._fatigue += difference);}

    get strife() {return this._strife;}
    changeStrife(difference) {this._strife = Math.max(0, this._strife += difference);}

    get voidPoints() {return this._voidPoints;}
    changeVoidPoints(difference) {this._voidPoints = Math.min(Math.max(0, this._voidPoints += difference), dataManager.loaded.ringMaps.all["Void"]);}

    getEndurance() {return (dataManager.loaded.ringMaps.all["Earth"] + dataManager.loaded.ringMaps.all["Fire"])*2;}
    getComposure() {return (dataManager.loaded.ringMaps.all["Earth"] + dataManager.loaded.ringMaps.all["Water"])*2;}
    getFocus() {return dataManager.loaded.ringMaps.all["Fire"] + dataManager.loaded.ringMaps.all["Air"];}
    getVigilance() {return (dataManager.loaded.ringMaps.all["Air"] + dataManager.loaded.ringMaps.all["Water"])/2;}

    endOfScene() {
        this._fatigue = Math.ceil(Math.min(this._fatigue, this.getEndurance()/2));
        this._strife = Math.ceil(Math.min(this._strife, this.getComposure()/2));
        //UPDATE DISPLAY
    }

    rest() {
        changeFatigue(-dataManager.loaded.ringMaps.all["Water"]*2);
        //UPDATE DISPLAY
    }

    unmasking() {
        this._strife = 0;
        //UPDATE DISPLAY
    }

    // CREATE A METHOD TO ADD TITLES
}

// #endregion ----------------------------------------------------------------------------------------------------

// #region Execution order ----------------------------------------------------------------------------------------------------

// Create a dataManager singleton
const dataManager = new DataManager();
// Create a contentManager singleton
const contentManager = new ContentManager();

// JSON caching and content object creation are done through dataManager.initialize() as an async process
dataManager.initialize().then(() => {




    // TO DO: DISPLAY ELEMENTS BASED ON USER SETTINGS: LATEST CHARACTER, TAB AND FILTERS




    // TEMPORARY TESTING
    contentManager.selectSchoolTEST(); // CREATE A BAREBONES DEFAULT CHARACTER AND UPDATE FILTERED SETS, THEN DISPLAY THE TECHNIQUES BASED ON DEFAULT FILTER SETTINGS

    // ALLOW THE USER TO REPEAT THE PREVIOUS STEP WITH A NEW CHARACTER FROM ANOTHER SCHOOL, OR TO CHANGE FILTERS
    document.getElementById("tempSchoolDropdown").addEventListener('change', contentManager.selectSchoolTEST);
    document.getElementById("rankFilter").addEventListener('change', contentManager.filterTechniques);
    document.getElementById("typeFilter").addEventListener('change', contentManager.filterTechniques);
    document.getElementById("ringFilter").addEventListener('change', contentManager.filterTechniques);
    document.getElementById("availabilityFilter").addEventListener('change', contentManager.filterTechniques);
    document.getElementById("curriculaFilter").addEventListener('change', contentManager.filterTechniques);
});

// #endregion ----------------------------------------------------------------------------------------------------